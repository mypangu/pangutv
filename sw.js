const CACHE_VERSION = "0311250200";  
const CACHE_NAME = `live-tv-cache-${CACHE_VERSION}`;

// Only cache static assets
const urlsToCache = [
  '/',
  '/index.html',
  '/player.html',
  '/channel_details.json'
];

// Install event - cache static files
self.addEventListener('install', function(event) {
  console.log('[ServiceWorker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('[ServiceWorker] Caching static assets');
        return cache.addAll(urlsToCache);
      })
      .catch(function(error) {
        console.error('[ServiceWorker] Cache failed:', error);
      })
  );
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', function(event) {
  console.log('[ServiceWorker] Activating...');
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            console.log('[ServiceWorker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Take control of all pages immediately
  return self.clients.claim();
});

// Fetch event - smart caching strategy
self.addEventListener('fetch', function(event) {
  const url = new URL(event.request.url);
  const requestUrl = event.request.url;
  
  // === NEVER CACHE THESE (Video streams, APIs, external resources) ===
  const noCachePatterns = [
    '.m3u8',           // HLS playlists
    '.mpd',            // DASH manifests
    '.ts',             // Video segments
    '.m4s',            // DASH segments
    'live.php',        // Your streaming endpoint
    'dlive.php',       // Your DRM streaming endpoint
    'rest_api.php',    // Your API endpoint
    'workers.dev',     // Cloudflare workers
    'playyonogames.in',// Your streaming domain
    'jwpcdn.com',      // JW Player CDN
    'cdnjs.cloudflare.com' // External scripts
  ];
  
  // Check if request should bypass cache
  const shouldBypassCache = noCachePatterns.some(pattern => 
    requestUrl.includes(pattern)
  );
  
  // Also bypass cache for POST requests
  if (event.request.method !== 'GET' || shouldBypassCache) {
    console.log('[ServiceWorker] Bypassing cache for:', requestUrl);
    return event.respondWith(
      fetch(event.request)
        .catch(function(error) {
          console.error('[ServiceWorker] Fetch failed:', error);
          throw error;
        })
    );
  }
  
  // === CACHE STRATEGY FOR STATIC ASSETS ===
  event.respondWith(
    caches.match(event.request)
      .then(function(cachedResponse) {
        // Return cached version if available
        if (cachedResponse) {
          console.log('[ServiceWorker] Serving from cache:', requestUrl);
          
          // Fetch in background to update cache (stale-while-revalidate)
          fetch(event.request)
            .then(function(networkResponse) {
              if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                caches.open(CACHE_NAME)
                  .then(function(cache) {
                    cache.put(event.request, networkResponse.clone());
                  });
              }
            })
            .catch(function() {
              // Network fetch failed, continue using cache
            });
          
          return cachedResponse;
        }
        
        // Not in cache, fetch from network
        console.log('[ServiceWorker] Fetching from network:', requestUrl);
        return fetch(event.request)
          .then(function(networkResponse) {
            // Check if valid response
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }
            
            // Cache the new response
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then(function(cache) {
                cache.put(event.request, responseToCache);
              });
            
            return networkResponse;
          })
          .catch(function(error) {
            console.error('[ServiceWorker] Network fetch failed:', error);
            throw error;
          });
      })
  );
});

// Listen for messages from the app
self.addEventListener('message', function(event) {
  if (event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
  
  if (event.data.action === 'clearCache') {
    event.waitUntil(
      caches.keys().then(function(cacheNames) {
        return Promise.all(
          cacheNames.map(function(cacheName) {
            return caches.delete(cacheName);
          })
        );
      })
    );
  }
});