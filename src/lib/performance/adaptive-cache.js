/**
 * adaptive-cache.js
 * 
 * Sistema avançado de cache com TTL adaptativo baseado em padrões de uso,
 * integrado com Fragment Cache, Service Worker e Cloudflare KV Storage.
 * 
 * Features:
 * - TTL dinâmico baseado na popularidade dos recursos
 * - Suporte a stale-while-revalidate para alta disponibilidade
 * - Prefetch e warmup automático de cache
 * - Métricas de hit/miss para otimização contínua
 * - Invalidação seletiva com versionamento
 * - Cache multi-nível (memória, IndexedDB, Cloudflare KV)
 * - Adaptação a características do dispositivo e conexão
 */

import { calculateHitRatio, FRAGMENT_TYPES, DEFAULT_TTL } from '../fragment-cache.js';

// Configurações padrão
const DEFAULT_OPTIONS = {
  // Estratégia de cache
  strategy: 'adaptive', // 'adaptive', 'fixed', 'network-first'
  
  // TTL base em segundos para cada tipo de recurso
  baseTTL: { ...DEFAULT_TTL },
  
  // Fator multiplicador para recursos populares
  popularityMultiplier: 2.0,
  
  // Fator redutor para recursos não populares
  unpopularityMultiplier: 0.5,
  
  // Limite de threshold para considerar um recurso popular (acessos por dia)
  popularityThreshold: 10,
  
  // TTL máximo (em segundos)
  maxTTL: 86400 * 7, // 1 semana
  
  // TTL mínimo (em segundos)
  minTTL: 60, // 1 minuto
  
  // Tempo de stale permitido além do TTL (em segundos)
  staleWhileRevalidateTime: 3600, // 1 hora
  
  // Se deve adaptar TTL com base na conexão
  adaptToConnection: true,
  
  // Fator de redução para conexões lentas
  slowConnectionFactor: 0.5,
  
  // Janela de tempo para medir popularidade (em segundos)
  popularityWindow: 86400, // 24 horas
  
  // Ativar warm-up automático do cache
  enableWarmup: true,
  
  // Lista de padrões URLs para aquecimento
  warmupPatterns: [
    '/produtos',
    '/produto/'
  ],
  
  // Quantidade máxima de URLs para warm-up
  maxWarmupUrls: 20,
  
  // Intervalo de verificação de métricas (em segundos)
  metricsInterval: 3600, // 1 hora
  
  // Persistir métricas entre sessões
  persistMetrics: true,
  
  // Namespace para métricas no localStorage
  metricsNamespace: 'cache_metrics_',
  
  // Prefixo para chaves de cache
  cacheKeyPrefix: 'adaptive_cache_',
  
  // Nome do store do IndexedDB
  idbStoreName: 'adaptive_cache',
  
  // Versão do banco IndexedDB
  idbVersion: 1,
  
  // Uso de métricas de Cloudflare
  useCloudflareAnalytics: true
};

// Estado do sistema
let options = { ...DEFAULT_OPTIONS };
let metricsStore = new Map();
let cacheInitialized = false;
let idbDatabase = null;

/**
 * Inicializar sistema de cache adaptativo
 * @param {Object} customOptions - Opções personalizadas
 */
export async function initAdaptiveCache(customOptions = {}) {
  // Evitar inicialização dupla
  if (cacheInitialized) return;
  
  // Mesclar opções personalizadas
  options = { ...DEFAULT_OPTIONS, ...customOptions };
  
  // Restaurar métricas persistentes
  if (options.persistMetrics) {
    restoreMetrics();
  }
  
  // Inicializar IndexedDB se disponível
  if ('indexedDB' in window) {
    await initIndexedDB();
  }
  
  // Iniciar monitoramento de métricas periódico
  if (options.metricsInterval > 0) {
    setInterval(analyzeAndOptimizeCache, options.metricsInterval * 1000);
  }
  
  // Pré-aquecer cache se habilitado
  if (options.enableWarmup) {
    warmupCache();
  }
  
  cacheInitialized = true;
  console.log('Adaptive Cache: Inicializado');
}

/**
 * Inicializar banco IndexedDB para cache
 * @returns {Promise<void>}
 */
async function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(options.idbStoreName, options.idbVersion);
    
    request.onupgradeneeded = event => {
      const db = event.target.result;
      
      // Criar object store para cache se não existir
      if (!db.objectStoreNames.contains('cache')) {
        const store = db.createObjectStore('cache', { keyPath: 'id' });
        store.createIndex('expiry', 'expiry', { unique: false });
      }
      
      // Criar object store para métricas se não existir
      if (!db.objectStoreNames.contains('metrics')) {
        db.createObjectStore('metrics', { keyPath: 'id' });
      }
    };
    
    request.onsuccess = event => {
      idbDatabase = event.target.result;
      console.log('Adaptive Cache: IndexedDB inicializado');
      
      // Limpar entradas expiradas
      cleanExpiredCache();
      
      resolve();
    };
    
    request.onerror = event => {
      console.error('Erro ao abrir IndexedDB:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Limpar entradas expiradas do cache
 */
function cleanExpiredCache() {
  if (!idbDatabase) return;
  
  const now = Date.now();
  const transaction = idbDatabase.transaction(['cache'], 'readwrite');
  const store = transaction.objectStore('cache');
  const index = store.index('expiry');
  
  // Encontrar todas as entradas expiradas
  const range = IDBKeyRange.upperBound(now);
  const request = index.openCursor(range);
  
  request.onsuccess = event => {
    const cursor = event.target.result;
    if (cursor) {
      // Remover entrada expirada
      store.delete(cursor.primaryKey);
      cursor.continue();
    }
  };
  
  transaction.oncomplete = () => {
    console.log('Adaptive Cache: Limpeza de cache expirado concluída');
  };
}

/**
 * Restaurar métricas do localStorage
 */
function restoreMetrics() {
  if (!('localStorage' in window)) return;
  
  try {
    // Buscar todas as chaves com o namespace de métricas
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(options.metricsNamespace)) {
        const resourceKey = key.substring(options.metricsNamespace.length);
        const metricsData = JSON.parse(localStorage.getItem(key));
        
        if (metricsData && typeof metricsData === 'object') {
          metricsStore.set(resourceKey, metricsData);
        }
      }
    }
    
    console.log(`Adaptive Cache: ${metricsStore.size} métricas restauradas`);
  } catch (e) {
    console.error('Erro ao restaurar métricas de cache:', e);
  }
}

/**
 * Persistir métricas para o localStorage
 */
function persistMetrics() {
  if (!options.persistMetrics || !('localStorage' in window)) return;
  
  try {
    for (const [key, value] of metricsStore.entries()) {
      localStorage.setItem(`${options.metricsNamespace}${key}`, JSON.stringify(value));
    }
  } catch (e) {
    console.error('Erro ao persistir métricas de cache:', e);
  }
}

/**
 * Analisar métricas e otimizar TTLs de cache
 */
async function analyzeAndOptimizeCache() {
  console.log('Adaptive Cache: Analisando métricas para otimização');
  
  // Processar cada entrada de métricas
  for (const [key, metrics] of metricsStore.entries()) {
    // Calcular taxa de acerto
    const hitRatio = calculateHitRatio(metrics.hits || 0, metrics.misses || 0);
    
    // Calcular acessos por dia
    const accessesPerDay = calculateAccessesPerDay(metrics);
    
    // Determinar se o recurso é popular
    const isPopular = accessesPerDay >= options.popularityThreshold;
    
    // Obter tipo de recurso e TTL base
    const resourceType = metrics.type || FRAGMENT_TYPES.GENERIC;
    const baseTTL = options.baseTTL[resourceType] || DEFAULT_TTL[resourceType] || 3600;
    
    // Calcular novo TTL
    let newTTL = baseTTL;
    
    if (options.strategy === 'adaptive') {
      if (isPopular) {
        // Recursos populares têm TTL aumentado
        newTTL = Math.min(
          baseTTL * options.popularityMultiplier,
          options.maxTTL
        );
      } else {
        // Recursos não populares têm TTL reduzido
        newTTL = Math.max(
          baseTTL * options.unpopularityMultiplier,
          options.minTTL
        );
      }
      
      // Ajustar com base na taxa de acerto (maior acerto = maior confiança = maior TTL)
      const hitRatioFactor = Math.max(0.5, Math.min(1.5, hitRatio / 50));
      newTTL *= hitRatioFactor;
    }
    
    // Atualizar TTL na métrica
    metrics.recommendedTTL = Math.floor(newTTL);
    metrics.lastUpdated = Date.now();
    
    console.log(`Adaptive Cache: Recurso ${key} - Popular: ${isPopular}, Acessos/dia: ${accessesPerDay.toFixed(2)}, Hit Ratio: ${hitRatio.toFixed(2)}%, Novo TTL: ${metrics.recommendedTTL}s`);
  }
  
  // Persistir métricas atualizadas
  if (options.persistMetrics) {
    persistMetrics();
  }
  
  // Enviar métricas agregadas para analytics
  if (options.useCloudflareAnalytics) {
    sendAggregateMetricsToAnalytics();
  }
}

/**
 * Calcular acessos por dia para um recurso
 * @param {Object} metrics - Métricas do recurso
 * @returns {number} Acessos por dia
 */
function calculateAccessesPerDay(metrics) {
  const now = Date.now();
  const totalAccesses = (metrics.hits || 0) + (metrics.misses || 0);
  
  // Se não há primeiro acesso registrado, usar o valor default
  if (!metrics.firstAccess) {
    return totalAccesses;
  }
  
  // Calcular quantos dias se passaram desde o primeiro acesso
  const daysSinceFirstAccess = (now - metrics.firstAccess) / (1000 * 86400);
  
  // Evitar divisão por zero
  if (daysSinceFirstAccess < 0.001) {
    return totalAccesses * 100; // Valor alto para recursos novos
  }
  
  return totalAccesses / daysSinceFirstAccess;
}

/**
 * Enviar métricas agregadas para analytics
 */
function sendAggregateMetricsToAnalytics() {
  // Calcular métricas agregadas
  let totalHits = 0;
  let totalMisses = 0;
  let totalResources = metricsStore.size;
  let popularResources = 0;
  
  for (const metrics of metricsStore.values()) {
    totalHits += metrics.hits || 0;
    totalMisses += metrics.misses || 0;
    
    const accessesPerDay = calculateAccessesPerDay(metrics);
    if (accessesPerDay >= options.popularityThreshold) {
      popularResources++;
    }
  }
  
  const globalHitRatio = calculateHitRatio(totalHits, totalMisses);
  
  // Construir objeto de métricas para analytics
  const analyticsData = {
    totalHits,
    totalMisses,
    totalResources,
    popularResources,
    globalHitRatio,
    timestamp: Date.now()
  };
  
  // Enviar para endpoint de analytics se navegação beacon suportada
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/metrics/cache-performance', JSON.stringify(analyticsData));
    console.log('Adaptive Cache: Métricas enviadas para analytics');
  }
}

/**
 * Recuperar um item do cache
 * @param {string} key - Chave do recurso
 * @param {Object} options - Opções adicionais
 * @returns {Promise<Object>} Objeto com dados e estado do cache
 */
export async function getCachedItem(key, options = {}) {
  const cacheKey = `${options.cacheKeyPrefix || DEFAULT_OPTIONS.cacheKeyPrefix}${key}`;
  const now = Date.now();
  
  // Registrar acesso para métricas
  recordAccess(key, false);
  
  try {
    // Verificar primeiro na memória usando localStorage
    if ('localStorage' in window) {
      try {
        const cachedValue = localStorage.getItem(cacheKey);
        
        if (cachedValue) {
          const parsed = JSON.parse(cachedValue);
          
          if (parsed && parsed.expiry) {
            if (parsed.expiry > now) {
              // Cache válido
              recordAccess(key, true);
              return {
                data: parsed.data,
                status: 'hit',
                expiry: parsed.expiry,
                source: 'local_storage'
              };
            } else if (parsed.expiry + (options.staleTime || options.staleWhileRevalidateTime || DEFAULT_OPTIONS.staleWhileRevalidateTime) * 1000 > now) {
              // Cache stale mas utilizável
              recordAccess(key, true);
              return {
                data: parsed.data,
                status: 'stale',
                expiry: parsed.expiry,
                source: 'local_storage'
              };
            }
          }
        }
      } catch (e) {
        // Ignorar erros de localStorage
      }
    }
    
    // Verificar no IndexedDB se disponível
    if (idbDatabase) {
      try {
        const transaction = idbDatabase.transaction(['cache'], 'readonly');
        const store = transaction.objectStore('cache');
        const request = store.get(cacheKey);
        
        const result = await new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        
        if (result && result.expiry) {
          if (result.expiry > now) {
            // Cache válido
            recordAccess(key, true);
            return {
              data: result.data,
              status: 'hit',
              expiry: result.expiry,
              source: 'indexed_db'
            };
          } else if (result.expiry + (options.staleTime || options.staleWhileRevalidateTime || DEFAULT_OPTIONS.staleWhileRevalidateTime) * 1000 > now) {
            // Cache stale mas utilizável
            recordAccess(key, true);
            return {
              data: result.data,
              status: 'stale',
              expiry: result.expiry,
              source: 'indexed_db'
            };
          }
        }
      } catch (e) {
        console.error('Erro ao acessar IndexedDB:', e);
      }
    }
    
    // Se chegou aqui, é um cache miss
    return {
      data: null,
      status: 'miss',
      expiry: null,
      source: null
    };
  } catch (e) {
    console.error('Erro ao recuperar do cache:', e);
    return {
      data: null,
      status: 'error',
      expiry: null,
      source: null,
      error: e.message
    };
  }
}

/**
 * Armazenar um item no cache
 * @param {string} key - Chave do recurso
 * @param {*} data - Dados a serem armazenados
 * @param {Object} options - Opções adicionais
 * @returns {Promise<boolean>} Sucesso da operação
 */
export async function setCachedItem(key, data, options = {}) {
  const cacheKey = `${options.cacheKeyPrefix || DEFAULT_OPTIONS.cacheKeyPrefix}${key}`;
  const now = Date.now();
  
  // Determinar TTL apropriado
  let ttl = calculateTTL(key, options);
  
  // Expiry timestamp
  const expiry = now + (ttl * 1000);
  
  // Objeto a ser armazenado
  const cacheObject = {
    id: cacheKey,
    data,
    expiry,
    created: now,
    type: options.type || FRAGMENT_TYPES.GENERIC,
    version: options.version || 'latest'
  };
  
  try {
    // Armazenar em localStorage, se possível
    if ('localStorage' in window) {
      try {
        localStorage.setItem(cacheKey, JSON.stringify(cacheObject));
      } catch (e) {
        console.warn('Não foi possível armazenar em localStorage:', e);
      }
    }
    
    // Armazenar em IndexedDB, se disponível
    if (idbDatabase) {
      try {
        const transaction = idbDatabase.transaction(['cache'], 'readwrite');
        const store = transaction.objectStore('cache');
        store.put(cacheObject);
        
        await new Promise((resolve, reject) => {
          transaction.oncomplete = resolve;
          transaction.onerror = reject;
        });
      } catch (e) {
        console.error('Erro ao armazenar no IndexedDB:', e);
      }
    }
    
    console.log(`Adaptive Cache: Item ${key} armazenado com TTL de ${ttl}s`);
    return true;
  } catch (e) {
    console.error('Erro ao armazenar no cache:', e);
    return false;
  }
}

/**
 * Calcular TTL apropriado para um recurso
 * @param {string} key - Chave do recurso
 * @param {Object} options - Opções adicionais
 * @returns {number} TTL em segundos
 */
function calculateTTL(key, options = {}) {
  // Se um TTL específico foi fornecido, usá-lo
  if (options.ttl && typeof options.ttl === 'number') {
    return Math.max(options.ttl, DEFAULT_OPTIONS.minTTL);
  }
  
  // Obter tipo de recurso
  const resourceType = options.type || FRAGMENT_TYPES.GENERIC;
  
  // TTL base para esse tipo
  const baseTTL = DEFAULT_OPTIONS.baseTTL[resourceType] || DEFAULT_TTL[resourceType] || 3600;
  
  // Se não estamos usando estratégia adaptativa, retornar o TTL base
  if (DEFAULT_OPTIONS.strategy !== 'adaptive') {
    return baseTTL;
  }
  
  // Verificar se temos métricas para este recurso
  const metrics = metricsStore.get(key);
  
  if (!metrics || !metrics.recommendedTTL) {
    // Se não temos métricas ainda, usar o TTL base
    return baseTTL;
  }
  
  // Usar o TTL recomendado com base nas métricas
  let adaptiveTTL = metrics.recommendedTTL;
  
  // Ajustar TTL com base na qualidade da conexão, se configurado
  if (DEFAULT_OPTIONS.adaptToConnection && 'connection' in navigator) {
    const connection = navigator.connection;
    
    if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
      // Reduzir TTL em conexões lentas para ter conteúdo mais fresco
      adaptiveTTL *= DEFAULT_OPTIONS.slowConnectionFactor;
    }
  }
  
  // Garantir que o TTL está dentro dos limites
  adaptiveTTL = Math.max(adaptiveTTL, DEFAULT_OPTIONS.minTTL);
  adaptiveTTL = Math.min(adaptiveTTL, DEFAULT_OPTIONS.maxTTL);
  
  return adaptiveTTL;
}

/**
 * Registrar acesso a um recurso para métricas
 * @param {string} key - Chave do recurso
 * @param {boolean} isHit - Se foi hit ou miss
 */
function recordAccess(key, isHit) {
  if (!key) return;
  
  // Obter ou criar métricas para este recurso
  let metrics = metricsStore.get(key);
  
  if (!metrics) {
    metrics = {
      hits: 0,
      misses: 0,
      firstAccess: Date.now(),
      lastAccess: Date.now()
    };
    metricsStore.set(key, metrics);
  }
  
  // Atualizar contadores
  if (isHit) {
    metrics.hits = (metrics.hits || 0) + 1;
  } else {
    metrics.misses = (metrics.misses || 0) + 1;
  }
  
  metrics.lastAccess = Date.now();
  
  // Se configurado, persistir métricas ao vivo
  if (DEFAULT_OPTIONS.persistMetrics && Math.random() < 0.1) {
    // Persistir ocasionalmente (10% das vezes) para reduzir sobrecarga
    persistMetrics();
  }
}

/**
 * Invalidar uma entrada específica do cache
 * @param {string} key - Chave do recurso
 * @returns {Promise<boolean>} Sucesso da operação
 */
export async function invalidateCacheItem(key) {
  const cacheKey = `${DEFAULT_OPTIONS.cacheKeyPrefix}${key}`;
  
  try {
    // Remover do localStorage, se possível
    if ('localStorage' in window) {
      localStorage.removeItem(cacheKey);
    }
    
    // Remover do IndexedDB, se disponível
    if (idbDatabase) {
      const transaction = idbDatabase.transaction(['cache'], 'readwrite');
      const store = transaction.objectStore('cache');
      store.delete(cacheKey);
      
      await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = reject;
      });
    }
    
    console.log(`Adaptive Cache: Item ${key} invalidado`);
    return true;
  } catch (e) {
    console.error('Erro ao invalidar cache:', e);
    return false;
  }
}

/**
 * Pré-aquecer o cache com recursos importantes
 */
async function warmupCache() {
  // Verificar se o warm-up está habilitado
  if (!DEFAULT_OPTIONS.enableWarmup) return;
  
  console.log('Adaptive Cache: Iniciando warm-up do cache');
  
  try {
    // Obter URLs populares para warm-up do histórico de navegação, se permitido
    const urlsToWarmup = await getPopularUrls();
    
    // Filtrar URLs para padrões de interesse
    const filteredUrls = urlsToWarmup.filter(url => {
      return DEFAULT_OPTIONS.warmupPatterns.some(pattern => url.includes(pattern));
    }).slice(0, DEFAULT_OPTIONS.maxWarmupUrls);
    
    if (filteredUrls.length === 0) {
      console.log('Adaptive Cache: Nenhuma URL encontrada para warm-up');
      return;
    }
    
    console.log(`Adaptive Cache: Warm-up para ${filteredUrls.length} URLs`);
    
    // Carregar as URLs durante idle time
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        performWarmup(filteredUrls);
      });
    } else {
      // Fallback para setTimeout
      setTimeout(() => {
        performWarmup(filteredUrls);
      }, 3000);
    }
  } catch (e) {
    console.error('Erro durante cache warm-up:', e);
  }
}

/**
 * Obter URLs populares para warmup
 * @returns {Promise<Array<string>>} Lista de URLs
 */
async function getPopularUrls() {
  const urls = [];
  
  // Verificar histórico recente se disponível e permitido
  if ('performance' in window && 'getEntriesByType' in performance) {
    try {
      // Obter navegações recentes
      const navigations = performance.getEntriesByType('navigation');
      
      navigations.forEach(nav => {
        if (nav.name && typeof nav.name === 'string') {
          const url = new URL(nav.name);
          // Adicionar apenas caminhos locais
          if (url.host === window.location.host) {
            urls.push(url.pathname);
          }
        }
      });
    } catch (e) {
      console.warn('Erro ao obter entradas de performance:', e);
    }
  }
  
  // Adicionar página atual e seus links
  urls.push(window.location.pathname);
  
  // Extrair links da página atual
  const links = Array.from(document.querySelectorAll('a[href^="/"]'));
  links.forEach(link => {
    if (link.href) {
      try {
        const url = new URL(link.href);
        urls.push(url.pathname);
      } catch (e) {
        // Ignorar URLs inválidas
      }
    }
  });
  
  // Adicionar páginas populares das métricas
  const popularFromMetrics = Array.from(metricsStore.entries())
    .filter(([key, metrics]) => {
      const accessesPerDay = calculateAccessesPerDay(metrics);
      return accessesPerDay >= DEFAULT_OPTIONS.popularityThreshold;
    })
    .map(([key]) => key)
    .filter(key => key.startsWith('/'));
  
  urls.push(...popularFromMetrics);
  
  // Remover duplicatas
  return [...new Set(urls)];
}

/**
 * Executar warm-up para um conjunto de URLs
 * @param {Array<string>} urls - Lista de URLs
 */
function performWarmup(urls) {
  // Limitar número de requisições paralelas
  const CONCURRENT_REQUESTS = 2;
  let active = 0;
  let index = 0;
  
  // Função para buscar próxima URL
  function fetchNext() {
    if (index >= urls.length) return;
    
    const url = urls[index++];
    active++;
    
    // Buscar com cache-control: only-if-cached para preferir cache existente
    fetch(url, { 
      method: 'GET',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'X-Cache-Warmup': '1'
      },
      credentials: 'same-origin',
      priority: 'low',
      cache: 'force-cache'
    })
    .catch(() => {
      // Ignorar erros, é apenas warm-up
    })
    .finally(() => {
      active--;
      if (active < CONCURRENT_REQUESTS) {
        fetchNext();
      }
    });
    
    // Se ainda podemos buscar mais em paralelo
    if (active < CONCURRENT_REQUESTS && index < urls.length) {
      fetchNext();
    }
  }
  
  // Iniciar o processo
  fetchNext();
}