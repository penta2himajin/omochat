import { defineConfig } from 'vite'

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
})
