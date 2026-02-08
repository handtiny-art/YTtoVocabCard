
const CACHE_NAME = 'vocab-master-v4';

// 這裡我們快取所有可能的進入路徑
const ASSETS = [
  './',
  'index.html',
  'index.tsx',
  'manifest.json',
  'https://cdn-icons-png.flaticon.com/512/3898/3898082.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // 分開 add 以確保即便 index.tsx 抓取失敗，其他核心檔案也能存入
      return Promise.allSettled(
        ASSETS.map(url => cache.add(url))
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // 核心邏輯：如果是導航請求 (開啟 App)，永遠優先回傳 index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          // 如果網路失敗，從快取找 index.html 或根路徑
          return caches.match('index.html') || caches.match('./');
        })
    );
    return;
  }

  // 其他資源 (JS, CSS, 圖片)
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
