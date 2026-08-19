// Minimal service worker for PWA packaging.
// Note: Even Hub WebView may ignore service workers; this file is harmless.
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', () => {
  // No-op caching to keep behavior predictable in the constrained WebView.
})

