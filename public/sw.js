// Service worker de YOHA VIDEO: funciona sin conexión después de la primera visita.
const VERSION = '__VERSION__';
const SHELL = `yoha-shell-${VERSION}`;
const ENGINE = 'yoha-engine-v0.12.10'; // FFmpeg core (≈31 MB): se guarda aparte y no se borra en cada versión
const PRECACHE = '__PRECACHE__';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(Array.isArray(PRECACHE) ? PRECACHE : ['./', './index.html'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('yoha-shell-') && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // Google/YouTube nunca se cachean
  if (url.pathname.includes('/ffmpeg/')) {
    e.respondWith(caches.open(ENGINE).then(async (c) => (await c.match(req)) || fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; })));
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(SHELL).then((c) => c.put('./index.html', copy)); return r; }).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok && url.pathname.match(/\.(js|css|png|svg|webmanifest|ipynb)$/)) { const copy = r.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); } return r; })));
});
