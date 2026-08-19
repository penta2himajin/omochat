import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const src = resolve('node_modules/@litert-lm/core/wasm')
const dest = resolve('public/litert-lm/wasm')

if (!existsSync(src)) {
  console.error('Missing @litert-lm/core wasm/. Run: npm install')
  process.exit(1)
}

mkdirSync(dest, { recursive: true })
cpSync(src, dest, { recursive: true })
console.log(`Copied LiteRT-LM wasm to ${dest}`)
