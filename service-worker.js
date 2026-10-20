'use strict';

// The only offline content is this neutral connection message. Lessons, sign-in,
// student activity and API responses are never stored in the service-worker cache.
const CACHE_PREFIX = 'hudavendigar-english-offline-';
const CACHE_NAME = `${CACHE_PREFIX}__PWA_OFFLINE_REVISION__`;
const SCOPE = new URL(self.registration.scope);
const OFFLINE_URL = new URL('offline.html', SCOPE).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const response = await fetch(OFFLINE_URL, { cache: 'no-store' });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
      throw new Error('The offline connection page could not be installed.');
    }
    const cache = await caches.open(CACHE_NAME);
    await cache.put(OFFLINE_URL, response);
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;
  // API requests remain entirely with the original network implementation.
  const relative = url.pathname.slice(SCOPE.pathname.length);
  if (relative === 'api' || relative.startsWith('api/')) return;

  event.respondWith((async () => {
    try {
      // Content-addressed public media cannot become stale: changed bytes get a
      // new URL. Let the browser reuse those bytes; never cache lesson/API HTML.
      const immutableMedia = /^assets\/media\/[a-f0-9]{64}\.(?:jpg|png|webp|gif|wav|mp3|ogg|pdf|docx)$/.test(relative);
      // Always ask the network for HTML, catalogs, scripts and JSON.
      // HTTP failures such as 401/404/500 remain the server's actual response.
      return await fetch(request, { cache: immutableMedia ? 'default' : 'no-store' });
    } catch (error) {
      if (request.mode !== 'navigate') throw error;
      const cache = await caches.open(CACHE_NAME);
      const offline = await cache.match(OFFLINE_URL);
      if (offline) return offline;
      throw error;
    }
  })());
});
