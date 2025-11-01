const CACHE_NAME = 'iptv-player-v1';
const urlsToCache = [
  './',
  './index.html',
  './index.css',
  './js/app.js',
  './js/components/categoryList.js',
  './js/components/streamList.js',
  './js/components/videoPlayer.js',
  './js/components/userInfo.js',
  './js/components/settingsPanel.js',
  './js/services/apiService.js',
  './js/services/storageService.js',
  './js/utils/debounce.js',
  './js/utils/domHelpers.js',
  './js/utils/mobileNavigation.js',
  './js/utils/logger.js',
  './favicon.svg',
  'https://cdn.jsdelivr.net/npm/hls.js@latest'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching files');
        return Promise.all(
          urlsToCache.map(url => {
            return fetch(url).then(response => {
              if (response.ok) {
                return cache.put(url, response);
              }
            }).catch(error => {
              console.warn('Failed to cache:', url, error);
            });
          })
        );
      })
      .catch((error) => {
        console.error('Service Worker: Error caching files', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Don't intercept API requests
  if (event.request.url.includes('/player_api.php')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        return response || fetch(event.request)
          .then((response) => {
            // Don't cache non-GET requests
            if (event.request.method !== 'GET') {
              return response;
            }

            // Check if response is valid
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response for caching
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch(() => {
            // Return offline page if available
            if (event.request.destination === 'document') {
              return caches.match('./index.html');
            }
          });
      })
  );
});

