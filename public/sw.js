/* ORBIT service worker: reads work offline, writes never do.
 * - GET navigations and same-origin assets: network first, cached copy on failure;
 *   a navigation that finds nothing gets the cached app shell.
 * - Read-only /api GETs the browsing pages use: network first, stored on success.
 * - Everything else (non-GET, /api/users, /api/live, .ics) is not intercepted. */
const CACHE = 'orbit-v1';
const SHELL = '/__shell';
const API_READS = /^\/api\/(bootstrap|sessions|speakers|venues|vendors|sponsors)(\/|$)/;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});

const cacheable = (url) => (url.pathname.startsWith('/api/')
  ? API_READS.test(url.pathname) && !url.pathname.endsWith('.ics')
  : true);

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !cacheable(url)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(request);
      if (res.ok) {
        cache.put(request, res.clone());
        if (request.mode === 'navigate') cache.put(SHELL, res.clone());
      }
      return res;
    } catch (err) {
      const hit = await cache.match(request);
      if (hit) return hit;
      if (request.mode === 'navigate') {
        const shell = await cache.match(SHELL);
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
