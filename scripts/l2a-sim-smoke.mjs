#!/usr/bin/env node
/**
 * L2a Hub Simulator automation smoke.
 * Expects evenhub-simulator already running with --automation-port.
 *
 * Usage: node scripts/l2a-sim-smoke.mjs [--base http://127.0.0.1:9898]
 */
import { PNG } from 'pngjs'
import { setTimeout as sleep } from 'node:timers/promises'

const READY_MARKER = '[omochat] ready'
const DEFAULT_BASE = 'http://127.0.0.1:9898'

function parseArgs(argv) {
  let base = DEFAULT_BASE
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base' && argv[i + 1]) {
      base = argv[++i].replace(/\/$/, '')
    }
  }
  return { base }
}

async function getText(base, path) {
  const res = await fetch(`${base}${path}`)
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return res.text()
}

async function getJson(base, path) {
  const res = await fetch(`${base}${path}`)
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return res.json()
}

async function getPng(base, path) {
  const res = await fetch(`${base}${path}`)
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function postJson(base, path, body) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
}

function litPixelCount(pngBuf) {
  const png = PNG.sync.read(pngBuf)
  let lit = 0
  for (let i = 3; i < png.data.length; i += 4) {
    if (png.data[i] > 0) lit++
  }
  return lit
}

async function waitForPing(base, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  let lastErr = ''
  while (Date.now() < deadline) {
    try {
      const text = (await getText(base, '/api/ping')).trim()
      if (text === 'pong' || text.includes('pong')) return
      lastErr = `unexpected ping body: ${text}`
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
    await sleep(250)
  }
  throw new Error(`simulator ping failed: ${lastErr}`)
}

async function waitForReady(base, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  let sinceId = 0
  while (Date.now() < deadline) {
    const data = await getJson(base, `/api/console?since_id=${sinceId}`)
    for (const entry of data.entries ?? []) {
      sinceId = Math.max(sinceId, entry.id ?? 0)
      const msg = String(entry.message ?? '')
      if (msg.includes(READY_MARKER)) return
    }
    await sleep(250)
  }
  throw new Error(`App did not log "${READY_MARKER}" within ${timeoutMs}ms`)
}

async function main() {
  const { base } = parseArgs(process.argv.slice(2))
  console.log(`l2a-sim-smoke: base=${base}`)

  await waitForPing(base)
  console.log('l2a-sim-smoke: ping ok')

  await waitForReady(base)
  console.log('l2a-sim-smoke: ready marker ok')
  // Input before createStartUpPageContainer is dropped; give the capture path a beat.
  await sleep(1500)

  const bootPng = await getPng(base, '/api/screenshot/glasses')
  const bootLit = litPixelCount(bootPng)
  if (bootLit < 100) {
    throw new Error(`framebuffer blank after ready (lit=${bootLit})`)
  }
  console.log(`l2a-sim-smoke: boot lit pixels=${bootLit}`)

  // Drive a short gesture sequence. omochat maps double_click → view toggle (not OS exit).
  for (const action of ['down', 'up', 'click']) {
    await postJson(base, '/api/input', { action })
    await sleep(400)
  }

  const afterPng = await getPng(base, '/api/screenshot/glasses')
  const afterLit = litPixelCount(afterPng)
  if (afterLit < 100) {
    throw new Error(`framebuffer went blank after input (lit=${afterLit})`)
  }
  const changed = Buffer.compare(bootPng, afterPng) !== 0
  console.log(
    `l2a-sim-smoke: after gestures lit=${afterLit} framebuffer_changed=${changed}`,
  )

  const ping = (await getText(base, '/api/ping')).trim()
  if (!ping.includes('pong')) throw new Error(`post-input ping failed: ${ping}`)

  // Soft signal: prefer a visible UI change, but boot+lit+live control plane is the merge gate.
  if (!changed) {
    console.warn(
      'l2a-sim-smoke: warning — framebuffer PNG identical after gestures (menu may be inert without API config)',
    )
  }

  console.log('l2a-sim-smoke: OK')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
