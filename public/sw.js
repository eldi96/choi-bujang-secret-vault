const CACHE = 'aleph-offline-shell-v1';
const OFFLINE = '/offline.html';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add(OFFLINE)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('aleph-offline-shell-') && key !== CACHE)
      .map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // API・認証・書き込みは横取りせず、保護応答はキャッシュしません。
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')
      || request.method !== 'GET' || request.mode !== 'navigate') return;
  event.respondWith(fetch(request).catch(async () => {
    const offline = await caches.match(OFFLINE, { cacheName: CACHE });
    return offline || new Response('오프라인입니다. 연결 후 다시 시도해 주세요.', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }));
});
