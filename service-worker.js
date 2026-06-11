// ============================================================
// SERVICE WORKER — Allira ADM PWA
// Versão: 1.0.0
// Estratégia: Cache-First para assets, Network-First para páginas
// ============================================================

const APP_VERSION = 'v1.0.0';
const CACHE_STATIC = `allira-static-${APP_VERSION}`;
const CACHE_DYNAMIC = `allira-dynamic-${APP_VERSION}`;
const CACHE_IMAGES = `allira-images-${APP_VERSION}`;

// Assets que serão cacheados imediatamente no install
const STATIC_ASSETS = [
  '/app/homeadm',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/offline.html'
];

// Padrões de URL que NUNCA devem ser cacheados
const NEVER_CACHE = [
  '/api/',
  '/admin/ajax',
  'chrome-extension',
  'googleapis.com/identitytoolkit',
  'firestore.googleapis.com'
];

// ──────────────────────────────────────────
// INSTALL: pre-cache assets estáticos
// ──────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Install — versão:', APP_VERSION);
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Alguns assets não puderam ser cacheados:', err);
      });
    })
  );
  self.skipWaiting();
});

// ──────────────────────────────────────────
// ACTIVATE: limpa caches antigos
// ──────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate — versão:', APP_VERSION);
  const allowedCaches = [CACHE_STATIC, CACHE_DYNAMIC, CACHE_IMAGES];

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => !allowedCaches.includes(name))
          .map((name) => {
            console.log('[SW] Deletando cache antigo:', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

// ──────────────────────────────────────────
// FETCH: estratégias de cache por tipo
// ──────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora requisições não-GET
  if (request.method !== 'GET') return;

  // Ignora URLs que nunca devem ser cacheadas
  if (NEVER_CACHE.some((pattern) => request.url.includes(pattern))) return;

  // Ignora extensões de browser
  if (!url.protocol.startsWith('http')) return;

  // ── Imagens: Cache-First com fallback ──
  if (request.destination === 'image') {
    event.respondWith(cacheFirst(request, CACHE_IMAGES));
    return;
  }

  // ── Assets estáticos (JS, CSS, fontes): Cache-First ──
  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font'
  ) {
    event.respondWith(cacheFirst(request, CACHE_STATIC));
    return;
  }

  // ── Navegação (páginas HTML): Network-First com fallback offline ──
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }

  // ── Demais requisições: Stale-While-Revalidate ──
  event.respondWith(staleWhileRevalidate(request, CACHE_DYNAMIC));
});

// ──────────────────────────────────────────
// ESTRATÉGIAS DE CACHE
// ──────────────────────────────────────────

/**
 * Cache-First: retorna do cache; se não existir, busca na rede e cacheia.
 */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Asset não disponível offline.', { status: 503 });
  }
}

/**
 * Network-First: tenta a rede; se falhar, retorna do cache.
 * Para navegação, exibe página offline como fallback final.
 */
async function networkFirstWithOfflineFallback(request) {
  const cache = await caches.open(CACHE_DYNAMIC);

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    // Fallback: página offline
    const offlinePage = await caches.match('/offline.html');
    return offlinePage || new Response(
      `<!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Sem conexão — Allira</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: system-ui, sans-serif;
            background: #0f0f1a;
            color: #e8e8f0;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            text-align: center;
            padding: 2rem;
          }
          .icon { font-size: 4rem; margin-bottom: 1.5rem; }
          h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.75rem; color: #c8b8ff; }
          p { color: #9090aa; line-height: 1.6; margin-bottom: 1.5rem; }
          button {
            background: #7c5cbf;
            color: white;
            border: none;
            padding: 0.75rem 2rem;
            border-radius: 8px;
            font-size: 1rem;
            cursor: pointer;
          }
        </style>
      </head>
      <body>
        <div>
          <div class="icon">📡</div>
          <h1>Você está offline</h1>
          <p>Verifique sua conexão com a internet e tente novamente.</p>
          <button onclick="window.location.reload()">Tentar novamente</button>
        </div>
      </body>
      </html>`,
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

/**
 * Stale-While-Revalidate: retorna cache imediatamente e atualiza em background.
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await caches.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => cached);

  return cached || fetchPromise;
}

// ──────────────────────────────────────────
// BACKGROUND SYNC (para ações offline)
// ──────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending-actions') {
    event.waitUntil(syncPendingActions());
  }
});

async function syncPendingActions() {
  // Implemente aqui a lógica de sincronização de ações offline
  console.log('[SW] Background sync executado.');
}

// ──────────────────────────────────────────
// PUSH NOTIFICATIONS (base para implementar)
// ──────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || 'Nova notificação',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    data: { url: data.url || '/app/homeadm' },
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Allira', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/app/homeadm';
  event.waitUntil(clients.openWindow(url));
});
