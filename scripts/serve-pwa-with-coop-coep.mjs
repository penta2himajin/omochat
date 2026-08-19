import http from 'node:http'
import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function getArg(name, fallback) {
  const idx = process.argv.indexOf(name)
  if (idx === -1) return fallback
  return process.argv[idx + 1] ?? fallback
}

const dirArg = getArg('--dir', '')
const port = Number(getArg('--port', '4180'))
const useHttps = process.argv.includes('--https')
const keyPath = getArg('--key', '')
const certPath = getArg('--cert', '')
const baseDir = dirArg ? path.resolve(process.cwd(), dirArg) : path.resolve(process.cwd(), 'dist')

if (!fs.existsSync(baseDir)) {
  console.error(`Directory not found: ${baseDir}`)
  process.exit(1)
}

const COOP = 'same-origin'
const COEP = 'credentialless'

const handler = async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
    const reqPath = url.pathname === '/' ? '/index.html' : url.pathname
    const safePath = path.normalize(reqPath).replace(/^(\.\.(\/|\\|$))+/, '')
    const absPath = path.join(baseDir, safePath)

    // SPA fallback
    const serveFile = () => {
      const file = absPath.startsWith(baseDir) && fs.existsSync(absPath) && fs.statSync(absPath).isFile() ? absPath : path.join(baseDir, 'index.html')
      const contentType =
        file.endsWith('.html') ? 'text/html; charset=utf-8' :
        file.endsWith('.js') ? 'text/javascript; charset=utf-8' :
        file.endsWith('.css') ? 'text/css; charset=utf-8' :
        file.endsWith('.json') ? 'application/json; charset=utf-8' :
        file.endsWith('.wasm') ? 'application/wasm; charset=utf-8' :
        file.endsWith('.png') ? 'image/png' :
        file.endsWith('.jpg') || file.endsWith('.jpeg') ? 'image/jpeg' :
        'application/octet-stream'

      res.writeHead(200, {
        'Content-Type': contentType,
        // Origin isolation for WebGPU / shared memory / worker reliability
        'Cross-Origin-Opener-Policy': COOP,
        'Cross-Origin-Embedder-Policy': COEP,
        'Cross-Origin-Resource-Policy': 'same-origin',
      })
      res.end(fs.readFileSync(file))
    }

    serveFile()
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(e instanceof Error ? e.message : String(e))
  }
}

const server = useHttps
  ? https.createServer(
      {
        key: fs.readFileSync(path.resolve(process.cwd(), keyPath)),
        cert: fs.readFileSync(path.resolve(process.cwd(), certPath)),
      },
      handler,
    )
  : http.createServer(handler)

server.listen(port, '0.0.0.0', () => {
  console.log(`PWA server: ${useHttps ? 'https' : 'http'}://127.0.0.1:${port}/`)
  console.log(`dir: ${baseDir}`)
})

