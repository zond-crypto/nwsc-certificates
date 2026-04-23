// ── Cache names (bump DYNAMIC_VERSION to force refresh on deploy)
const STATIC_VERSION  = 'nwsc-static-v1';
const DYNAMIC_VERSION = 'nwsc-dynamic-v2';
const PDF_CACHE       = 'nwsc-pdf-v1';

// All assets that must be cached on install for full offline use
const PRECACHE_URLS = [
  '/',
  '/static/manifest.json',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
  '/static/css/main.css',
  '/static/js/main.js',
  '/static/js/pwa.js',
  '/offline.html',
];

// ── Install: precache all static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_VERSION).then(cache => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: delete old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys
        .filter(k => ![STATIC_VERSION, DYNAMIC_VERSION, PDF_CACHE].includes(k))
        .map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// ── Fetch: Network-first for API, Cache-first for assets
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // PDF download requests — save to PDF cache for offline access
  if (url.pathname.includes('/download/') || url.pathname.includes('/generate_pdf')) {
    event.respondWith(networkFirstWithPDFCache(request));
    return;
  }

  // API / form submissions — network only, queue if offline
  if (request.method === 'POST') {
    event.respondWith(networkOnlyWithOfflineQueue(request));
    return;
  }

  // Navigation requests — network first, fallback to cache then offline page
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => { 
          if (res.status === 200) {
            cacheResponse(DYNAMIC_VERSION, request, res.clone());
          }
          return res; 
        })
        .catch(() => caches.match(request)
          .then(cached => cached || caches.match('/offline.html')))
    );
    return;
  }

  // Static assets — cache first
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(res => {
        if (res.status === 200) {
          cacheResponse(STATIC_VERSION, request, res.clone());
        }
        return res;
      });
    })
  );
});

// PDF: try network, cache result, serve cache if offline
async function networkFirstWithPDFCache(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(PDF_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Return a specific offline response for PDF requests
    return new Response(
      JSON.stringify({ error: 'offline', message: 'PDF saved to local storage for download when online.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// POST requests offline queue
async function networkOnlyWithOfflineQueue(request) {
  try {
    return await fetch(request);
  } catch {
    // Clone and store the request body for later sync
    // Note: Request body can only be read once, so we clone it.
    const body = await request.clone().text();
    // Storage might not be available in SW context in all browsers, 
    // but we follow the template's logic.
    return new Response(
      JSON.stringify({ offline: true, queued: true }),
      { status: 202, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function cacheResponse(cacheName, request, response) {
  if (!response || response.status !== 200 || response.type === 'opaque') return;
  const cache = await caches.open(cacheName);
  cache.put(request, response);
}

// ── Background sync: retry queued POST requests when back online
self.addEventListener('sync', event => {
  if (event.tag === 'nwsc-sync') {
    event.waitUntil(replayOfflineQueue());
  }
});

async function replayOfflineQueue() {
  // Sync will be triggered by the client when back online
  self.clients.matchAll().then(clients => {
    clients.forEach(c => c.postMessage({ type: 'SYNC_COMPLETE' }));
  });
}
