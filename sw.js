<<<<<<< HEAD
// Service Worker — Pragyan Institute Portal (v83.3)
const CACHE_NAME = 'pragyan-portal-v90.0.41b75292';
=======
// ============================================================================
// Service Worker — Pragyan Institute Portal
// ----------------------------------------------------------------------------
// CACHE_NAME and every ?v= tag below are rewritten by scripts/cache_bust.js from
// a SHA-256 of the built assets, so a deploy always lands in a fresh cache and
// the activate handler evicts the previous generation.
//
// Three deliberate corrections over the previous revision:
//   1. The precache list was missing js/config.js, js/academic-config.js,
//      js/chat.js, pay.html and features.html — the offline shell booted with a
//      SupabaseSync that had no config and a pricing toggle with no fee table.
//   2. cache.addAll() is atomic: one 404 rejected the whole batch and install
//      "succeeded" with an empty cache. Assets are added individually now.
//   3. Offline after a deploy, a request for the new build hash missed the copy
//      cached under the old one, because caches.match() compares the query
//      string. Every script 404'd and the page rendered blank. Fallbacks retry
//      with { ignoreSearch: true }.
// ============================================================================

const CACHE_NAME = 'pragyan-portal-v90.0.4dc3a91d';
>>>>>>> claude/admiring-kepler-50a04f

// Static assets to pre-cache for instant loads
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './pay.html',
  './features.html',
  './manifest.json',
<<<<<<< HEAD
  './css/variables.css?v=90.0.41b75292',
  './css/main.css?v=90.0.41b75292',
  './css/components.css?v=90.0.41b75292',
  './css/animations.css?v=90.0.41b75292',
  './css/portal.css?v=90.0.41b75292',
  './js/config.js?v=90.0.41b75292',
  './js/chat.js?v=90.0.41b75292',
  './js/supabase-sync.js?v=90.0.41b75292',
  './js/app.js?v=90.0.41b75292',
  './js/portal.js?v=90.0.41b75292',
=======
  './css/variables.css?v=90.0.4dc3a91d',
  './css/main.css?v=90.0.4dc3a91d',
  './css/components.css?v=90.0.4dc3a91d',
  './css/animations.css?v=90.0.4dc3a91d',
  './css/portal.css?v=90.0.4dc3a91d',
  './js/config.js?v=90.0.4dc3a91d',
  './js/academic-config.js?v=90.0.4dc3a91d',
  './js/supabase-sync.js?v=90.0.4dc3a91d',
  './js/chat.js?v=90.0.4dc3a91d',
  './js/app.js?v=90.0.4dc3a91d',
  './js/portal.js?v=90.0.4dc3a91d',
>>>>>>> claude/admiring-kepler-50a04f
  './assets/images/favicon.ico',
  './assets/images/logo.png',
  './assets/images/apple-touch-icon.png',
  './assets/images/hero_slide_1.jpg',
  './assets/images/hero_slide_2.jpg',
  './assets/images/hero_slide_3.jpg',
  './assets/images/hero_slide_4.jpg',
  './assets/images/chandan_upi_qr.png',
  './assets/images/teacher_chandan.jpg',
  './assets/images/teacher_ravi.png',
  './assets/images/teacher_aditi.jpg'
];

// bcryptjs and supabase-js come from a CDN. Without them cached, an offline
// login could not hash a password at all, so they are precached best-effort —
// a CDN failure must never block the rest of the shell.
const PRECACHE_VENDOR = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
  'https://cdn.jsdelivr.net/npm/bcryptjs@2.4.3/dist/bcrypt.min.js'
];

const OFFLINE_FALLBACK_PAGE = './index.html';

/**
 * Cache each asset on its own. cache.addAll() rejects atomically, so a single
 * renamed image used to leave the whole shell uncached.
 */
async function precache() {
  const cache = await caches.open(CACHE_NAME);
  const urls = PRECACHE_ASSETS.concat(PRECACHE_VENDOR);
  const results = await Promise.allSettled(
    // `cache: 'reload'` bypasses the HTTP cache so a new build hash never
    // precaches the bytes the browser already had under the old one.
    urls.map(url => cache.add(new Request(url, { cache: 'reload' })))
  );
  const failed = urls.filter((_, index) => results[index].status === 'rejected');
  if (failed.length) console.warn(`[SW] Precached ${urls.length - failed.length}/${urls.length}; skipped:`, failed);
}

/** Cache write that never rejects the response it is passing through. */
function cachePut(request, response) {
  if (!response || response.status !== 200 || response.type === 'opaque') return;
  const copy = response.clone();
  caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
}

/**
 * Exact match, then the same path under any ?v=, then an explicit fallback.
 * respondWith() throws a TypeError on undefined, so this always resolves to a
 * Response — Response.error() reproduces the plain network failure honestly.
 */
async function fromCache(request, fallbackUrl) {
  const exact = await caches.match(request);
  if (exact) return exact;
  const anyVersion = await caches.match(request, { ignoreSearch: true });
  if (anyVersion) return anyVersion;
  if (fallbackUrl) {
    const fallback = await caches.match(fallbackUrl, { ignoreSearch: true });
    if (fallback) return fallback;
  }
  return Response.error();
}

// Install: pre-cache critical shell assets
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(precache());
});

// Activate: clean up older cache generations and claim clients immediately
self.addEventListener('activate', event => {
  event.waitUntil(
<<<<<<< HEAD
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => (key !== CACHE_NAME || self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1') ? caches.delete(key) : null)
      );
    }).then(() => self.clients.claim())
=======
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
>>>>>>> claude/admiring-kepler-50a04f
  );
});

// Lets the page adopt a waiting build without a second reload.
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Fetch: network-first for code, cache-first for media
self.addEventListener('fetch', event => {
<<<<<<< HEAD
  const url = new URL(event.request.url);

  // Skip non-GET requests, API backend routes, direct Supabase calls, and localhost development from SW caching
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/') || url.hostname.includes('supabase.co') || url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
=======
  const request = event.request;
  let url;
  try {
    url = new URL(request.url);
  } catch (_) {
>>>>>>> claude/admiring-kepler-50a04f
    return;
  }

  // Skip non-GET, non-HTTP schemes (extensions, blob:, data:), API backend
  // routes and direct Supabase calls.
  if (request.method !== 'GET') return;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase.co')) return;

  // 1. Navigation / HTML: network-first so a deploy is picked up immediately,
  //    with the last good copy of *this* page (not just index) as the fallback.
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then(response => {
          cachePut(request, response);
          return response;
        })
        .catch(() => fromCache(request, OFFLINE_FALLBACK_PAGE))
    );
    return;
  }

  // 2. Code assets (JS & CSS): network-first with a version-agnostic fallback.
  if (
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    request.destination === 'script' ||
    request.destination === 'style'
  ) {
    event.respondWith(
      fetch(request)
        .then(response => {
          cachePut(request, response);
          return response;
        })
        .catch(() => fromCache(request))
    );
    return;
  }

  // 3. Media (images, icons, fonts): cache-first with network fallback.
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request)
        .then(response => {
          if (response && response.status === 200 && (response.type === 'basic' || response.type === 'cors')) {
            cachePut(request, response);
          }
          return response;
        })
        .catch(() => fromCache(request, request.destination === 'image' ? './assets/images/logo.png' : null));
    })
  );
});
