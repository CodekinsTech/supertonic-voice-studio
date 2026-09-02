/* sols AI · kokoro voice studio — service worker
 * Strategy: cache-first for model weights & runtime, network-first for shell.
 * Model weights are huge (~155 MB FP16). Once cached, the app runs offline.
 */

const VERSION   = 'v1.2.0';
const SHELL     = `kvs-shell-${VERSION}`;
const MODELS    = `kvs-models-${VERSION}`;
const VOICES    = `kvs-voices-${VERSION}`;

// Files needed for the app shell to render and run.
const SHELL_FILES = [
  './',
  './index.html',
  './app.html',
  './manifest.json',
];

// Origins we treat as model/voice CDNs (cache aggressively, immutable).
const MODEL_ORIGINS = [
  'https://huggingface.co',
  'https://cdn-lfs.huggingface.co',
  'https://cdn-lfs-us-1.huggingface.co',
  'https://cdn-lfs-eu-1.huggingface.co',
];

const RUNTIME_ORIGINS = [
  'https://cdn.jsdelivr.net',
  'https://esm.sh',
  'https://unpkg.com',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((k) => ![SHELL, MODELS, VOICES].includes(k) && k.startsWith('kvs-'))
        .map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

function isModelRequest(url) {
  return MODEL_ORIGINS.some((o) => url.startsWith(o)) &&
         /\.(onnx|onnx_data|bin|json|safetensors|pt|npy)(\?|$)/.test(url);
}

function isVoiceRequest(url) {
  return MODEL_ORIGINS.some((o) => url.startsWith(o)) &&
         /voices?\//.test(url) && /\.(bin|pt|npy)(\?|$)/.test(url);
}

function isRuntimeRequest(url) {
  return RUNTIME_ORIGINS.some((o) => url.startsWith(o));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = req.url;

  // Model weights / voices: cache forever (immutable hashes from HF CDN).
  if (isModelRequest(url) || isVoiceRequest(url) || isRuntimeRequest(url)) {
    const bucket = isVoiceRequest(url) ? VOICES : (isRuntimeRequest(url) ? SHELL : MODELS);
    event.respondWith(
      caches.open(bucket).then(async (cache) => {
        const hit = await cache.match(req, { ignoreVary: true });
        if (hit) return hit;
        const res = await fetch(req, { mode: 'cors', credentials: 'omit' });
        if (res && (res.status === 200 || res.status === 0)) {
          // Range requests return 206 — don't cache partials.
          if (res.status === 200) cache.put(req, res.clone());
        }
        return res;
      })
    );
    return;
  }

  // App shell: network-first so updates land fast, fall back to cache offline.
  if (req.mode === 'navigate' || SHELL_FILES.some((f) => url.endsWith(f.replace('./', '/')))) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(SHELL).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html') || caches.match('./app.html')))
    );
  }
});

// Allow the page to ask "how much have we cached?"
self.addEventListener('message', async (event) => {
  if (event.data?.type === 'cache-stats') {
    const stats = {};
    for (const name of [SHELL, MODELS, VOICES]) {
      try {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        let bytes = 0;
        for (const k of keys) {
          const r = await cache.match(k);
          if (r) {
            const cl = r.headers.get('content-length');
            if (cl) bytes += parseInt(cl, 10);
            else { try { const b = await r.clone().blob(); bytes += b.size; } catch {} }
          }
        }
        stats[name] = { count: keys.length, bytes };
      } catch { stats[name] = { count: 0, bytes: 0 }; }
    }
    event.source?.postMessage({ type: 'cache-stats', stats });
  }
  if (event.data?.type === 'clear-cache') {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('kvs-')).map((k) => caches.delete(k)));
    event.source?.postMessage({ type: 'cache-cleared' });
  }
});
