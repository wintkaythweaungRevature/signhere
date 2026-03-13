/**
 * eSignly Service Worker
 * Enables offline support and PWA installation
 */

var CACHE_NAME = 'esignly-v2';
var ASSETS = [
  '/',
  '/index.html',
  '/widget.js',
  '/widget.css',
  '/pdf-signer.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

/* Install – pre-cache core assets */
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

/* Activate – clean up old caches */
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; })
            .map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

/* Fetch – cache-first with network fallback */
self.addEventListener('fetch', function (e) {
  // Only handle GET requests to our own origin
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  e.respondWith(
    caches.match(e.request).then(function (cached) {
      if (cached) return cached;
      return fetch(e.request).then(function (response) {
        if (!response || response.status !== 200) return response;
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(e.request, clone);
        });
        return response;
      });
    })
  );
});
