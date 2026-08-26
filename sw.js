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

const CACHE_NAME = 'pragyan-portal-v90.0.ecc319f0';

// Static assets to pre-cache for instant loads
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './pay.html',
  './features.html',
  './manifest.json',
  './css/variables.css?v=90.0.ecc319f0',
  './css/main.css?v=90.0.ecc319f0',
  './css/components.css?v=90.0.ecc319f0',
  './css/animations.css?v=90.0.ecc319f0',
  './css/portal.css?v=90.0.ecc319f0',
  './js/stream-community-chat.js?v=90.0.ecc319f0',
  './js/blog-markdown.js?v=90.0.ecc319f0',
  './js/push-client.js?v=90.0.ecc319f0',
  './js/config.js?v=90.0.ecc319f0',
  './js/academic-config.js?v=90.0.ecc319f0',
  './js/supabase-sync.js?v=90.0.ecc319f0',
  './js/chat.js?v=90.0.ecc319f0',
  './js/app.js?v=90.0.ecc319f0',
  './js/portal.js?v=90.0.ecc319f0',
  './assets/images/favicon.ico',
  './assets/images/logo.png',
  './assets/images/apple-touch-icon.png',
  './assets/images/gallery_classroom_1.jpeg',
  './assets/images/hero_slide_4.jpg',
  './assets/images/hero_slide_1.jpg',
  './assets/images/hero_slide_2.jpg',
  './assets/images/hero_slide_3.jpg',
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
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Lets the page adopt a waiting build without a second reload.
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Fetch: network-first for code, cache-first for media
self.addEventListener('fetch', event => {
  const request = event.request;
  let url;
  try {
    url = new URL(request.url);
  } catch (_) {
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
          // A versioned asset that 404s online means a deploy removed it while
          // this tab still references the old ?v= — serve the cached copy of
          // ANY version rather than the error body. Without this, the
          // ignoreSearch fallback below only fired on network rejection.
          if (response && response.status === 404 && url.searchParams.has('v')) {
            return fromCache(request);
          }
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

// ============================================================================
// PUSH NOTIFICATIONS & INTERACTIVE DISPATCH (W3C Web Push)
// ============================================================================

self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    try {
      data = { title: 'Pragyan Institute Update', body: event.data ? event.data.text() : 'You have a new notification.' };
    } catch (__) {
      data = { title: 'Pragyan Institute Alert', body: 'New notification received.' };
    }
  }

  const title = data.title || 'Pragyan Institute Alert';
  const origin = self.location ? self.location.origin : '';
  const iconUrl = (data.icon && data.icon.startsWith('http')) ? data.icon : (origin + '/assets/images/logo.png');
  const badgeUrl = (data.badge && data.badge.startsWith('http')) ? data.badge : (origin + '/assets/images/logo.png');

  const options = {
    body: data.body || 'You have a new institutional update.',
    icon: iconUrl,
    badge: badgeUrl,
    image: data.image || undefined,
    tag: data.tag || ('pragyan-' + Date.now()),
    renotify: true,
    requireInteraction: data.priority === 'high',
    data: {
      url: data.url || (origin + '/'),
      actions: data.actions || []
    },
    vibrate: data.priority === 'high' ? [200, 100, 200, 100, 200] : [100, 50, 100],
    actions: Array.isArray(data.actions) ? data.actions.slice(0, 2).map(act => ({
      action: act.action || 'open',
      title: act.title || 'Open'
    })) : []
  };

  event.waitUntil(
    self.registration.showNotification(title, options).catch(err => {
      console.warn('[SW] showNotification error, falling back to minimal payload:', err);
      return self.registration.showNotification(title, {
        body: options.body,
        icon: iconUrl
      });
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const data = event.notification.data || {};
  let targetUrl = data.url || './';

  // If user tapped a specific action button
  if (event.action && Array.isArray(data.actions)) {
    const clickedAction = data.actions.find(a => a.action === event.action);
    if (clickedAction && clickedAction.url) {
      targetUrl = clickedAction.url;
    }
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client && targetUrl) {
            client.navigate(targetUrl);
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

