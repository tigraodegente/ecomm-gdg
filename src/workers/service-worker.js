/**
 * Service Worker para cache avançado client-side
 * 
 * Implementa diversas estratégias de cache para diferentes tipos de recursos:
 * - Pré-cache de assets críticos
 * - Cache com network fallback para assets estáticos
 * - Network com cache fallback para APIs
 * - Stale-while-revalidate para dados semi-dinâmicos
 * - Network-only para transações
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const PAGES_CACHE = `pages-${CACHE_VERSION}`;
const IMAGES_CACHE = `images-${CACHE_VERSION}`;
const API_CACHE = `api-${CACHE_VERSION}`;

// Assets para pré-cache durante a instalação (críticos para a app shell)
const PRECACHE_ASSETS = [
  '/',
  '/favicon.svg',
  '/_astro/alpine.js',
  '/_astro/index.css',
  '/images/logo.svg',
];

// Listener para instalar o service worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => {
      // Ativar imediatamente, sem esperar a atualização da página
      return self.skipWaiting();
    })
  );
});

// Listener para ativação (limpar caches antigos)
self.addEventListener('activate', event => {
  const expectedCacheNames = [STATIC_CACHE, PAGES_CACHE, IMAGES_CACHE, API_CACHE];
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Remover caches antigos ou não esperados
          if (!expectedCacheNames.includes(cacheName)) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Tomar controle de todas as abas abertas neste domínio
      return self.clients.claim();
    })
  );
});

// Listener principal para interceptar requisições
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Ignorar requisições de outros domínios (CORS, analytics, etc)
  if (url.origin !== location.origin) {
    return;
  }
  
  // Ignorar requisições não-GET (não fazemos cache de POST, PUT, DELETE)
  if (request.method !== 'GET') {
    return;
  }
  
  // Estratégias de cache diferentes por tipo de conteúdo
  
  // 1. Assets estáticos (cache-first)
  if (isStaticAsset(url)) {
    return event.respondWith(cacheFirst(request, STATIC_CACHE));
  }
  
  // 2. Imagens (cache-first com timeout)
  if (isImageAsset(url)) {
    return event.respondWith(cacheFirstWithTimeout(request, IMAGES_CACHE, 2000));
  }
  
  // 3. Páginas HTML (network-first com fallback para cache)
  if (isHTMLPage(request)) {
    return event.respondWith(networkFirstWithCache(request, PAGES_CACHE));
  }
  
  // 4. APIs de dados (stale-while-revalidate)
  if (isAPIRequest(url) && !isTransactionAPI(url)) {
    return event.respondWith(staleWhileRevalidate(request, API_CACHE));
  }
  
  // 5. APIs de transação (sempre online)
  if (isTransactionAPI(url)) {
    return event.respondWith(networkOnly(request));
  }
  
  // Fallback para estratégia padrão (network com fallback para cache)
  event.respondWith(networkWithCacheFallback(request, STATIC_CACHE));
});

// Estratégia: Cache-first com fallback para rede
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // Se não estiver em cache, buscar da rede e armazenar
  try {
    const networkResponse = await fetch(request);
    
    // Armazenar cópia em cache apenas se for bem-sucedido
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Se a rede falhar, retornar uma página offline
    if (isHTMLPage(request)) {
      return caches.match('/offline.html');
    }
    
    throw error;
  }
}

// Estratégia: Cache-first com timeout para rede
async function cacheFirstWithTimeout(request, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  // Retornar imediatamente de cache se disponível
  if (cachedResponse) {
    // Atualizar cache em background
    updateCache(request, cache);
    return cachedResponse;
  }
  
  // Criar uma Promise com timeout
  const networkPromise = fetchWithTimeout(request, timeoutMs);
  
  try {
    const networkResponse = await networkPromise;
    // Armazenar em cache
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // Se a rede falhar por timeout ou outro motivo, usar fallback
    if (isImageAsset(new URL(request.url))) {
      return caches.match('/images/placeholder.webp');
    }
    throw error;
  }
}

// Estratégia: Network-first com fallback para cache
async function networkFirstWithCache(request, cacheName) {
  const cache = await caches.open(cacheName);
  
  try {
    // Tentar buscar da rede primeiro
    const networkResponse = await fetch(request);
    
    // Se a rede funcionar, atualizar o cache
    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Se a rede falhar, tentar usar cache
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Se não estiver em cache, mostrar página offline
    if (isHTMLPage(request)) {
      return caches.match('/offline.html');
    }
    
    throw error;
  }
}

// Estratégia: Network com fallback para cache (sem atualizar cache)
async function networkWithCacheFallback(request, cacheName) {
  try {
    // Tentar buscar da rede
    return await fetch(request);
  } catch (error) {
    // Se a rede falhar, tentar usar cache
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Se não estiver em cache, propagar o erro
    throw error;
  }
}

// Estratégia: Stale-While-Revalidate
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  // Iniciar a atualização do cache em paralelo
  const networkPromise = fetch(request).then(response => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(error => {
    console.error('Erro ao atualizar cache:', error);
  });
  
  // Retornar resposta em cache imediatamente se existir
  if (cachedResponse) {
    // Iniciar a atualização, mas não esperar por ela
    event.waitUntil(networkPromise);
    return cachedResponse;
  }
  
  // Se não estiver em cache, aguardar a resposta da rede
  return networkPromise;
}

// Estratégia: Network-only (sem cache)
async function networkOnly(request) {
  return fetch(request);
}

// Atualiza o cache em background sem bloquear
async function updateCache(request, cache) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response);
    }
  } catch (error) {
    // Ignora erros de atualização em background
    console.warn('Erro ao atualizar cache em background:', error);
  }
}

// Helper: Fetch com timeout
function fetchWithTimeout(request, timeoutMs) {
  return new Promise((resolve, reject) => {
    // Criar timeout
    const timeoutId = setTimeout(() => {
      reject(new Error('Timeout ao buscar recurso'));
    }, timeoutMs);
    
    fetch(request).then(response => {
      // Limpar timeout quando receber resposta
      clearTimeout(timeoutId);
      resolve(response);
    }).catch(error => {
      // Limpar timeout em caso de erro
      clearTimeout(timeoutId);
      reject(error);
    });
  });
}

// Helper: Verificar se é asset estático
function isStaticAsset(url) {
  return url.pathname.startsWith('/_astro/') || 
         /\.(js|css|woff2|json)$/.test(url.pathname);
}

// Helper: Verificar se é imagem
function isImageAsset(url) {
  return /\.(jpe?g|png|gif|svg|webp|avif)$/.test(url.pathname) ||
         url.pathname.includes('/cdn-cgi/image/');
}

// Helper: Verificar se é uma página HTML
function isHTMLPage(request) {
  return request.headers.get('Accept')?.includes('text/html') &&
         !request.url.includes('/api/');
}

// Helper: Verificar se é uma requisição de API
function isAPIRequest(url) {
  return url.pathname.startsWith('/api/');
}

// Helper: Verificar se é uma API de transação (não cacheável)
function isTransactionAPI(url) {
  return url.pathname.includes('/api/cart') ||
         url.pathname.includes('/api/checkout') ||
         url.pathname.includes('/api/auth');
}

// Evento para sincronização em background
self.addEventListener('sync', event => {
  if (event.tag === 'sync-cart') {
    event.waitUntil(syncCart());
  } else if (event.tag === 'sync-wishlist') {
    event.waitUntil(syncWishlist());
  }
});

// Evento para notificações push
self.addEventListener('push', event => {
  const data = event.data.json();
  
  const options = {
    body: data.message,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: {
      url: data.url
    }
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Evento para clique em notificação
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.notification.data && event.notification.data.url) {
    event.waitUntil(
      clients.openWindow(event.notification.data.url)
    );
  }
});

// Sincronizar carrinho quando online
async function syncCart() {
  // Implementação para sincronizar carrinho offline quando retornar online
  // Buscaria pendingCartOperations do IndexedDB e enviaria ao servidor
}

// Sincronizar wishlist quando online
async function syncWishlist() {
  // Implementação para sincronizar wishlist offline quando retornar online
}