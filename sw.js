// Service Worker — Pragyan Institute Portal (v83.3)
const CACHE_NAME = 'pragyan-portal-v90.0.f3b981da';

// Static assets to pre-cache for instant loads
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/variables.css?v=90.0.f3b981da',
  './css/main.css?v=90.0.f3b981da',
  './css/components.css?v=90.0.f3b981da',
  './css/animations.css?v=90.0.f3b981da',
  './css/portal.css?v=90.0.f3b981da',
  './js/supabase-sync.js?v=90.0.f3b981da',
  './js/app.js?v=90.0.f3b981da',
  './js/portal.js?v=90.0.f3b981da',
  './assets/images/favicon.ico',
  './assets/images/logo.png',
  './assets/images/hero_slide_1.jpg',
  './assets/images/hero_slide_2.jpg',
  './assets/images/hero_slide_3.jpg',
  './assets/images/hero_slide_4.jpg',
  './assets/images/chandan_upi_qr.png',
  './assets/images/teacher_chandan.jpg',
  './assets/images/teacher_ravi.png'
];

// Install: pre-cache critical shell assets
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS).catch(err => console.warn('[SW] Precache note:', err)))
  );
});

// Activate: clean up older cache generations and claim clients immediately
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Stale-While-Revalidate / Cache-First strategy for ultra-fast, smooth page loads
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests, API backend routes, and direct Supabase database calls from SW interception
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/') || url.hostname.includes('supabase.co')) {
    return;
  }

  // 1. Navigation / HTML requests: Network-First (Fresh HTML with instant offline fallback)
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  // 2. Code Assets (JS & CSS): Network-First with Cache Fallback (Guarantees instant fresh updates)
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || event.request.destination === 'script' || event.request.destination === 'style') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 3. Media Assets (Images, Icons, Fonts): Cache-First with Network Fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200 && (response.type === 'basic' || response.type === 'cors')) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, copy));
        }
        return response;
      }).catch(err => {
        if (event.request.destination === 'image') {
          return caches.match('./assets/images/logo.png');
        }
        throw err;
      });
    })
  );
});
