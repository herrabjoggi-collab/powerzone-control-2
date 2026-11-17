const CACHE_VERSION = '3028259e914b';
const IS_DEV = CACHE_VERSION.startsWith('pz-dev');
const CACHE_NAME = `powerzone-shell-${CACHE_VERSION}`;
const PRECACHE_ASSETS = [
  "./",
  "./assets/index-B20SaBLK.css",
  "./assets/index-DJLAEdnP.js",
  "./icons/apple-touch-icon.png",
  "./icons/icon.svg",
  "./icons/pwa-192x192.png",
  "./icons/pwa-512x512.png",
  "./icons/pwa-maskable-512x512.png",
  "./index.html",
  "./manifest.json"
];

self.addEventListener('install', (event) => {
  if (IS_DEV) {
    event.waitUntil(self.skipWaiting());
    return;
  }

  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const requests = PRECACHE_ASSETS.map(
        (asset) => new Request(new URL(asset, self.registration.scope).href, { cache: 'reload' })
      );
      await Promise.allSettled(
        requests.map(async (req) => {
          try {
            const res = await fetch(req);
            if (res && res.ok) {
              await cache.put(req, res);
            }
          } catch {
            // Ignore individual precache failures
          }
        })
      );
      // Activate immediately only on initial install when no controller exists yet.
      if (!self.registration.active) {
        await self.skipWaiting();
      }
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('powerzone-shell-') && (IS_DEV || key !== CACHE_NAME))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (data.type === 'GET_VERSION') {
    const payload = {
      type: 'SW_VERSION',
      version: IS_DEV ? 'dev' : CACHE_VERSION,
      assetCount: IS_DEV ? 0 : PRECACHE_ASSETS.length,
    };
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage(payload);
    } else if (event.source) {
      event.source.postMessage(payload);
    }
  }
});

self.addEventListener('fetch', (event) => {
  if (IS_DEV) return;

  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Navigation requests: serve cached app shell cache-first for instant Airplane Mode startup.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const indexUrl = new URL('./index.html', self.registration.scope).href;
        const rootUrl = new URL('./', self.registration.scope).href;
        const cached =
          (await cache.match(request)) ||
          (await cache.match(indexUrl)) ||
          (await cache.match(rootUrl));

        if (cached) {
          if (self.navigator && self.navigator.onLine) {
            fetch(request)
              .then((res) => {
                if (res && res.ok) cache.put(indexUrl, res.clone());
              })
              .catch(() => {});
          }
          return cached;
        }

        try {
          const networkRes = await fetch(request);
          if (networkRes && networkRes.ok) {
            await cache.put(indexUrl, networkRes.clone());
          }
          return networkRes;
        } catch {
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        }
      })()
    );
    return;
  }

  const scopeUrl = self.registration.scope;
  const isSameScope = url.href.startsWith(scopeUrl);
  const isGoogleFont =
    url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

  if (!isSameScope && !isGoogleFont) return;

  // Cache-first strategy for bundled assets, icons, manifest, and loaded fonts.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request, { ignoreSearch: isSameScope });
      if (cached) return cached;

      try {
        const networkRes = await fetch(request);
        if (networkRes && (networkRes.ok || networkRes.type === 'opaque')) {
          await cache.put(request, networkRes.clone());
        }
        return networkRes;
      } catch {
        return new Response('', { status: 504, statusText: 'Offline Cache Miss' });
      }
    })()
  );
});
