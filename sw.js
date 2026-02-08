
const CACHE_NAME = 'vocab-master-v3';
const ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'https://cdn-icons-png.flaticon.com/512/3898/3898082.png'
];

// 安裝時快取核心資源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        ASSETS.map(url => cache.add(url))
      );
    })
  );
  self.skipWaiting();
});

// 激活時清理舊快取
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// 攔截請求
self.addEventListener('fetch', (event) => {
  // 只處理 GET 請求
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 1. 導航請求 (開啟頁面或重新整理)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // 如果網路回傳 404，則改用快取的 index.html
          if (response.status === 404) {
            return caches.match('index.html') || response;
          }
          return response;
        })
        .catch(() => {
          // 網路斷線時，嘗試回傳快取的目錄或 index.html
          return caches.match('./') || caches.match('index.html');
        })
    );
    return;
  }

  // 2. 一般資源請求 (JS, CSS, Images)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request);
    })
  );
});
