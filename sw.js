// Service worker : garde une copie des fichiers de l'app pour qu'elle marche sans Internet.
// Change la version quand tu modifies l'app, pour forcer la mise à jour.
const VERSION = 'pool-v2';
const FICHIERS = ['./', 'index.html', 'style.css', 'app.js', 'manifest.json', 'icon.svg', 'icon-180.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FICHIERS)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(cles => Promise.all(cles.filter(k => k !== VERSION).map(k => caches.delete(k)))));
});
// Réseau d'abord (pour avoir la dernière version), copie locale si pas d'Internet
self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
