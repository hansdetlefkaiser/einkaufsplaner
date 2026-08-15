/* Einkaufsplaner – Service Worker
   Sorgt für Offline-Fähigkeit und Installierbarkeit (PWA).

   WICHTIG bei künftigen Updates der App-Dateien:
   CACHE_NAME muss hochgezählt werden (z.B. v2, v3, …), sonst laden
   Geräte weiterhin die alte, zwischengespeicherte Version. */

const CACHE_NAME = 'einkaufsplaner-v1';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './lib/xlsx.full.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        if(networkResponse && networkResponse.status === 200){
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return networkResponse;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
