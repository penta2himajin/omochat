import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

function copyLiteRtLmWasm() {
  const src = resolve('node_modules/@litert-lm/core/wasm')
  const dest = resolve('public/litert-lm/wasm')
  if (!existsSync(src)) {
    throw new Error('Missing @litert-lm/core wasm/. Run: npm install')
  }
  mkdirSync(dest, { recursive: true })
  cpSync(src, dest, { recursive: true })
}

export default defineConfig({
  test: {
    environment: 'node',
  },
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
  },
  build: {
    target: 'esnext',
  },
  plugins: [
    {
      name: 'copy-litert-lm-wasm',
      buildStart() {
        copyLiteRtLmWasm()
      },
      configureServer() {
        copyLiteRtLmWasm()
      },
    },
  ],
})
