/**
 * prefetch-manager.js
 * 
 * Sistema de prefetching inteligente que antecipa navegações do usuário
 * e carrega recursos de forma proativa para melhorar a performance percebida.
 * 
 * Features:
 * - Prefetching baseado em hover/foco em links
 * - Prefetching baseado em viewport (links visíveis)
 * - Prefetching baseado em padrões de navegação
 * - Adaptação à qualidade da conexão do usuário
 * - Integração com Service Worker para cache
 */

// Opções padrão de configuração
const DEFAULT_OPTIONS = {
  // Quanto tempo esperar após hover antes de iniciar prefetch (ms)
  hoverDelay: 65,
  
  // Se deve fazer prefetch de links quando entram no viewport
  prefetchOnVisible: true,
  
  // Ignora prefetch se a conexão é lenta ou tem economia de dados
  respectDataSaver: true,
  
  // Limita prefetch em conexões lentas (2G, conexões economizadoras)
  respectConnectionType: true,
  
  // Limite de prefetches simultâneos
  concurrentPrefetches: 2,
  
  // Tipos de páginas a serem prefetchadas
  prefetchUrlPatterns: [
    // Página de produtos
    /^\/produtos\/.+$/,
    // Página de produto individual
    /^\/produto\/.+$/,
    // Categorias
    /^\/categoria\/.+$/
  ],
  
  // Cache no Service Worker
  enableServiceWorkerCache: true,
  
  // Prioridade do prefetch
  fetchPriority: 'low',
  
  // Se deve observar os padrões de navegação para predições
  enablePredictiveNavigation: true
};

// Estado do sistema
let options = { ...DEFAULT_OPTIONS };
let prefetchQueue = [];
let visibleLinks = new Set();
let isInitialized = false;
let connectionType = 'unknown';
let isSavingData = false;
let prefetchCount = 0;
let observer = null;

/**
 * Inicializar o sistema de prefetch
 * @param {Object} customOptions - Opções personalizadas
 */
export function initPrefetchManager(customOptions = {}) {
  // Evitar inicialização dupla
  if (isInitialized) return;
  
  // Mesclar opções personalizadas
  options = { ...DEFAULT_OPTIONS, ...customOptions };
  
  // Verificar suporte do navegador
  const prefetchSupported = 'connection' in navigator && 
                            'requestIdleCallback' in window &&
                            'IntersectionObserver' in window;
                            
  if (!prefetchSupported) {
    console.log('Prefetch Manager: Browser não suporta todos os recursos necessários');
    return;
  }
  
  // Obter informações de conexão
  if ('connection' in navigator) {
    const connection = navigator.connection;
    connectionType = connection.effectiveType || 'unknown';
    isSavingData = connection.saveData || false;
    
    // Ouvir mudanças na conexão
    connection.addEventListener('change', updateConnectionInfo);
  }
  
  // Configurar observadores
  setupIntersectionObserver();
  setupLinkListeners();
  
  // Marcar como inicializado
  isInitialized = true;
  
  console.log(`Prefetch Manager: Inicializado (conexão: ${connectionType}, economia de dados: ${isSavingData})`);
}

/**
 * Atualizar informações de conexão
 */
function updateConnectionInfo() {
  if (!('connection' in navigator)) return;
  
  const connection = navigator.connection;
  connectionType = connection.effectiveType || 'unknown';
  isSavingData = connection.saveData || false;
  
  console.log(`Prefetch Manager: Conexão atualizada (${connectionType}, economia: ${isSavingData})`);
}

/**
 * Configurar observador de interseção para detectar links visíveis
 */
function setupIntersectionObserver() {
  observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const link = entry.target;
        
        // Adicionar ao conjunto de links visíveis
        visibleLinks.add(link);
        
        // Se prefetch em visibilidade estiver ativado
        if (options.prefetchOnVisible) {
          schedulePrefetch(link.href, { priority: 'visible' });
        }
      } else {
        // Remover do conjunto quando não mais visível
        visibleLinks.delete(entry.target);
      }
    });
  }, {
    rootMargin: '200px', // Começar a observar um pouco antes do elemento ficar visível
    threshold: 0.1
  });
  
  // Observar links existentes
  document.querySelectorAll('a[href^="/"]').forEach(link => {
    if (shouldPrefetchUrl(link.href)) {
      observer.observe(link);
    }
  });
  
  // Observador de mutação para detectar novos links
  const mutationObserver = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Se o próprio nó é um link
            if (node.tagName === 'A' && node.href && shouldPrefetchUrl(node.href)) {
              observer.observe(node);
            }
            
            // Links dentro do nó adicionado
            node.querySelectorAll('a[href^="/"]').forEach(link => {
              if (shouldPrefetchUrl(link.href)) {
                observer.observe(link);
              }
            });
          }
        });
      }
    });
  });
  
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

/**
 * Configurar listeners para detectar hover em links
 */
function setupLinkListeners() {
  // Delegação de eventos para capturar hover em links
  document.body.addEventListener('mouseover', handleLinkHover);
  document.body.addEventListener('focusin', handleLinkHover);
  
  // Também capturar eventos de touch para dispositivos móveis
  document.body.addEventListener('touchstart', handleLinkTouch);
}

/**
 * Manipular evento de hover em links
 * @param {MouseEvent} event - Evento de mouse
 */
function handleLinkHover(event) {
  const link = findLinkElement(event.target);
  
  if (link && link.href && shouldPrefetchUrl(link.href)) {
    // Usar um timer para evitar prefetch em hoveres acidentais
    link._prefetchTimer = setTimeout(() => {
      schedulePrefetch(link.href, { priority: 'hover' });
    }, options.hoverDelay);
    
    // Limpar timer se o mouse sair antes do delay
    link.addEventListener('mouseout', () => {
      if (link._prefetchTimer) {
        clearTimeout(link._prefetchTimer);
        link._prefetchTimer = null;
      }
    }, { once: true });
  }
}

/**
 * Manipular evento de toque em links para dispositivos móveis
 * @param {TouchEvent} event - Evento de toque
 */
function handleLinkTouch(event) {
  const link = findLinkElement(event.target);
  
  if (link && link.href && shouldPrefetchUrl(link.href)) {
    // Em touch, fazemos prefetch imediatamente, pois provavelmente o usuário vai clicar
    schedulePrefetch(link.href, { priority: 'touch' });
  }
}

/**
 * Encontrar o elemento de link mais próximo
 * @param {HTMLElement} element - Elemento de partida
 * @returns {HTMLAnchorElement|null} Elemento de link ou null
 */
function findLinkElement(element) {
  while (element && element !== document.body) {
    if (element.tagName === 'A') {
      return element;
    }
    element = element.parentElement;
  }
  return null;
}

/**
 * Verificar se uma URL deve ser prefetchada
 * @param {string} url - URL para verificar
 * @returns {boolean} Se deve ser prefetchada
 */
function shouldPrefetchUrl(url) {
  // Ignorar links externos, âncoras e outros protocolos
  if (!url || !url.startsWith('/') || url.startsWith('#') || url.startsWith('mailto:')) {
    return false;
  }
  
  // Verificar se já foi prefetchada ou está na fila
  if (isPrefetched(url) || isInQueue(url)) {
    return false;
  }
  
  // Verificar se corresponde a algum padrão permitido
  let matchesPattern = false;
  for (const pattern of options.prefetchUrlPatterns) {
    if (pattern instanceof RegExp) {
      if (pattern.test(url)) {
        matchesPattern = true;
        break;
      }
    } else if (typeof pattern === 'string') {
      if (url.includes(pattern)) {
        matchesPattern = true;
        break;
      }
    }
  }
  
  if (!matchesPattern) {
    return false;
  }
  
  // Respeitar configurações de economia de dados
  if (options.respectDataSaver && isSavingData) {
    return false;
  }
  
  // Respeitar tipo de conexão
  if (options.respectConnectionType && (connectionType === 'slow-2g' || connectionType === '2g')) {
    return false;
  }
  
  return true;
}

/**
 * Verificar se uma URL já foi prefetchada
 * @param {string} url - URL para verificar
 * @returns {boolean} Se já foi prefetchada
 */
function isPrefetched(url) {
  return !!document.querySelector(`link[rel="prefetch"][href="${url}"]`);
}

/**
 * Verificar se uma URL já está na fila
 * @param {string} url - URL para verificar
 * @returns {boolean} Se já está na fila
 */
function isInQueue(url) {
  return prefetchQueue.some(item => item.url === url);
}

/**
 * Agendar prefetch de uma URL
 * @param {string} url - URL para prefetch
 * @param {Object} options - Opções adicionais
 */
function schedulePrefetch(url, { priority = 'low' } = {}) {
  // Evitar duplicatas
  if (isPrefetched(url) || isInQueue(url)) {
    return;
  }
  
  // Adicionar à fila com prioridade
  prefetchQueue.push({
    url,
    priority: priority === 'hover' ? 2 : (priority === 'visible' ? 1 : 0),
    timestamp: Date.now()
  });
  
  // Ordenar fila por prioridade
  prefetchQueue.sort((a, b) => b.priority - a.priority);
  
  // Processar a fila em idle time
  requestIdleCallback(processPrefetchQueue);
}

/**
 * Processar a fila de prefetch durante tempo ocioso
 * @param {IdleDeadline} deadline - Objeto de deadline do requestIdleCallback
 */
function processPrefetchQueue(deadline) {
  while ((deadline.timeRemaining() > 0 || deadline.didTimeout) && 
         prefetchQueue.length > 0 &&
         prefetchCount < options.concurrentPrefetches) {
    
    const item = prefetchQueue.shift();
    prefetchUrl(item.url);
  }
  
  // Se ainda há itens na fila, agendar outro processamento
  if (prefetchQueue.length > 0) {
    requestIdleCallback(processPrefetchQueue);
  }
}

/**
 * Realizar o prefetch de uma URL
 * @param {string} url - URL para prefetch
 */
function prefetchUrl(url) {
  prefetchCount++;
  
  // Prefetch via link rel="prefetch"
  const linkElem = document.createElement('link');
  linkElem.rel = 'prefetch';
  linkElem.href = url;
  linkElem.as = 'document';
  linkElem.fetchpriority = options.fetchPriority;
  
  // Quando concluir o prefetch (sucesso ou falha), decrementar contador
  linkElem.onload = linkElem.onerror = () => {
    prefetchCount--;
    
    // Se o Service Worker está disponível, também cache no SW
    if (options.enableServiceWorkerCache && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'CACHE_PAGE',
        url: url
      });
    }
    
    // Se há mais itens na fila, continuar processando
    if (prefetchQueue.length > 0) {
      requestIdleCallback(processPrefetchQueue);
    }
  };
  
  // Adicionar ao head
  document.head.appendChild(linkElem);
  
  console.log(`Prefetch Manager: Prefetch iniciado para ${url}`);
}

/**
 * Prefetch manual de uma URL específica
 * @param {string} url - URL para prefetch
 * @returns {boolean} Se o prefetch foi agendado
 */
export function prefetch(url) {
  if (shouldPrefetchUrl(url)) {
    schedulePrefetch(url, { priority: 'manual' });
    return true;
  }
  return false;
}

/**
 * Limpar recursos e desativar o prefetch manager
 */
export function cleanup() {
  if (!isInitialized) return;
  
  // Remover observadores
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  
  // Remover listeners
  document.body.removeEventListener('mouseover', handleLinkHover);
  document.body.removeEventListener('focusin', handleLinkHover);
  document.body.removeEventListener('touchstart', handleLinkTouch);
  
  // Limpar estado
  prefetchQueue = [];
  visibleLinks.clear();
  prefetchCount = 0;
  
  // Marcar como não inicializado
  isInitialized = false;
  
  console.log('Prefetch Manager: Desativado');
}