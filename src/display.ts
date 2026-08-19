import { phaseLabel, type AppError } from './errors.ts'
import type { EnvProbeResult } from './env/probe.ts'
import type { CompanionProbeResult } from './companion/probe.ts'

export const APP_VERSION = '0.0.13'
export const TEXT_UPGRADE_MAX = 2000

export type Mode = 'loading' | 'idle' | 'thinking' | 'error'

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

export type LoadingStep =
  | 'env-probe'
  | 'companion-probe'
  | 'cdn-import'
  | 'engine-create'
  | 'conversation-create'
  | 'done'

export type DisplayState = {
  mode: Mode
  selectedPromptIndex: number
  promptCount: number
  messages: ChatMessage[]
  streamingTail: string
  loadingStep?: LoadingStep
  env: EnvProbeResult
  companion: CompanionProbeResult
  modelLabel: string
  probeOnly: boolean
  companionProbe: boolean
  error?: AppError
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

export function formatHubText(state: DisplayState): string {
  const { env, companion } = state
  const lines: string[] = []
  lines.push(`omochat v${APP_VERSION}`)
  lines.push(`mode: ${state.mode}`)

  if (state.mode === 'loading' && state.loadingStep) {
    const label =
      state.loadingStep === 'cdn-import'
        ? 'litert-lm wasm'
        : state.loadingStep
    lines.push(`step: ${label}`)
  }

  lines.push(`omoserv: ${companion.status}`)
  if (companion.url) lines.push(`omoserv-url: ${clip(companion.url, 120)}`)
  if (companion.body) lines.push(`omoserv-body: ${clip(companion.body, 120)}`)
  if (companion.detail) lines.push(`omoserv-detail: ${clip(companion.detail, 160)}`)

  lines.push(`origin: ${env.origin}`)
  lines.push(`proto: ${env.protocol}`)
  lines.push(`secure: ${env.secureContext ? 'yes' : 'no'}`)
  lines.push(`coi: ${env.crossOriginIsolated ? 'yes' : 'no'}`)
  lines.push(`webgpu: ${env.webgpu.status}`)
  if (env.webgpu.reason) lines.push(`webgpu-reason: ${env.webgpu.reason}`)
  if (env.webgpu.adapterStrategy) lines.push(`webgpu-strategy: ${env.webgpu.adapterStrategy}`)
  if (env.webgpu.adapterInfo) lines.push(`webgpu-info: ${clip(env.webgpu.adapterInfo, 120)}`)
  if (env.webgpu.adapterFeatures) lines.push(`webgpu-features: ${clip(env.webgpu.adapterFeatures, 120)}`)
  if (env.webgpu.detail) lines.push(`webgpu-detail: ${clip(env.webgpu.detail, 160)}`)
  lines.push(`webgl2: ${env.webgl2 ? 'yes' : 'no'}`)
  if (env.webglRenderer) lines.push(`webgl-renderer: ${clip(env.webglRenderer, 120)}`)
  lines.push(`uad: ${env.uad ? clip(env.uad, 120) : '(unavailable)'}`)
  lines.push(`ua-full: ${clip(env.uaFull, 160)}`)
  lines.push(`model: ${state.modelLabel}`)
  if (state.probeOnly) lines.push('probeOnly: yes')
  if (state.companionProbe) lines.push('companionProbe: yes')

  if (state.mode === 'error' && state.error) {
    lines.push('')
    lines.push(`ERR @ ${phaseLabel(state.error.phase)}`)
    lines.push(clip(state.error.message, 240))
    if (state.error.detail) {
      lines.push('')
      lines.push(clip(state.error.detail.replace(/\s+/g, ' '), 360))
    }
  }

  if (state.mode === 'idle' && env.webgpu.status === 'supported' && !state.probeOnly && !state.companionProbe) {
    lines.push(`prompt: ${state.selectedPromptIndex + 1}/${state.promptCount}`)
    lines.push('press: send / double: next')
    lines.push('swipe: prev/next prompt')
  }
  if (state.mode === 'idle' && (state.probeOnly || state.companionProbe)) {
    lines.push('press/double: copy diagnostics')
  }
  if (state.mode === 'thinking') lines.push('press: cancel')

  lines.push('')
  for (const m of state.messages.slice(-4)) {
    lines.push(`${m.role === 'user' ? 'You' : 'AI'}: ${clip(m.content, 100)}`)
  }

  if (state.mode === 'thinking' && state.streamingTail) {
    lines.push('')
    lines.push(`AI: ${clip(state.streamingTail, 160)}`)
  }

  const out = lines.join('\n')
  return out.length > TEXT_UPGRADE_MAX ? clip(out, TEXT_UPGRADE_MAX) : out
}
