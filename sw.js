// Kindness Pirates service worker. VERSION and PRECACHE are rewritten by build.py.
const VERSION = '607d3f3e76';
const PRECACHE = ["./", "index.html", "stories.json", "stories.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png", "cover-01.jpg", "cover-02.jpg", "cover-03.jpg", "cover-04.jpg", "cover-05.jpg", "cover-06.jpg", "cover-07.jpg", "cover-08.jpg", "cover-09.jpg", "cover-10.jpg", "cover-11.jpg"];
const SHELL = 'kp-shell-' + VERSION;
const AUDIO = 'kp-audio-v1';   // saved stories survive app updates
const FONTS = 'kp-fonts-v1';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('kp-shell-') && k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: keep a copy so the app looks right offline
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== location.origin) return;

  // Story audio: serve saved copies (with byte ranges, which Safari needs), else the network
  if (url.pathname.endsWith('.mp3')) {
    e.respondWith(serveAudio(req));
    return;
  }

  // Story list and page: network first so new stories appear, cached copy when offline
  if (req.mode === 'navigate' || url.pathname.endsWith('/stories.json')) {
    const key = req.mode === 'navigate' ? './' : req;
    e.respondWith(fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(SHELL).then(c => c.put(key, copy)); } return r; })
      .catch(() => caches.match(key, { ignoreSearch: true })));
    return;
  }

  // Covers, icons, everything else: cache first
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(SHELL).then(c => c.put(req, copy)); }
    return r;
  })));
});

async function serveAudio(req) {
  const cache = await caches.open(AUDIO);
  const hit = await cache.match(req.url);
  if (!hit) return fetch(req);
  const range = req.headers.get('range');
  if (!range) return hit;
  const buf = await hit.arrayBuffer();
  const size = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  let start = m[1] ? parseInt(m[1], 10) : 0;
  let end = m[2] ? parseInt(m[2], 10) : size - 1;
  if (!m[1] && m[2]) { start = size - parseInt(m[2], 10); end = size - 1; }
  end = Math.min(end, size - 1);
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes' }
  });
}
