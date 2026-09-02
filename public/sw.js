const CACHE_NAME = 'supertonic-models-v1';
const HF_ORIGIN = 'https://huggingface.co';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (!url.startsWith(HF_ORIGIN)) return;
  if (!url.endsWith('.onnx') && !url.endsWith('.json')) return;

  e.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(e.request);
      if (cached) return cached;
      const resp = await fetch(e.request);
      if (resp.ok) cache.put(e.request, resp.clone());
      return resp;
    })
  );
});
