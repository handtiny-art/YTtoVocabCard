
const CACHE_NAME = 'vocab-master-v8'; // 更新版本號以清除舊快取

const ASSETS = [
  './',
  './index.html',
  './index.css',
  './manifest.json',
  'https://cdn-icons-png.flaticon.com/512/3898/3898082.png'
];

// 安裝時預先快取基礎資源
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

// 激活時清理舊版本的快取
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

// 核心修正：採用「網路優先」策略 (Network First)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 如果網路請求成功，將新資源存入快取並回傳
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // 當網路失敗時（斷網或 404），才從快取中尋找
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          
          // 如果是導航請求（如刷新頁面）且快取也沒有，回傳 index.html
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
  );
});
