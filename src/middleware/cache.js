/**
 * Middleware para gerenciamento avançado de cache
 * 
 * Este middleware implementa uma estratégia de cache de múltiplos níveis:
 * 1. Cache no navegador (via Cache-Control)
 * 2. Cache no edge da Cloudflare (via Cache API)
 * 3. Cache interno da aplicação (para dados de sessão e estado)
 * 
 * Utiliza patterns modernos como stale-while-revalidate para manter
 * a performance mesmo durante atualizações de dados.
 */

export const onRequest = async (context, next) => {
  // Extrair URL, método e outros parâmetros da requisição
  const { request } = context;
  const url = new URL(request.url);
  const method = request.method;
  
  // Ignorar métodos não-GET
  if (method !== 'GET') {
    return next();
  }
  
  // Ignorar APIs específicas que não devem ser cacheadas
  const noCachePaths = [
    '/api/cart',
    '/api/auth',
    '/checkout',
    '/minha-conta'
  ];
  
  if (noCachePaths.some(path => url.pathname.startsWith(path))) {
    return next();
  }
  
  // Configurar estratégia baseada no path
  const cacheConfig = getCacheConfig(url.pathname);
  
  // Se não for cacheável, apenas seguir
  if (!cacheConfig.cacheable) {
    return next();
  }
  
  // Gerar chave de cache
  const cacheKey = new Request(url.toString(), {
    method: 'GET',
    headers: new Headers({
      'X-Cache-Version': cacheConfig.version || '1',
      'Accept': request.headers.get('Accept') || '*/*',
      'Accept-Encoding': request.headers.get('Accept-Encoding') || ''
    })
  });
  
  // Verificar se temos em cache
  const cache = caches.default;
  let response = await cache.match(cacheKey);
  
  // Se temos resposta em cache e não é stale
  if (response) {
    // Adicionar header para indicar hit de cache
    const cachedResponse = new Response(response.body, response);
    cachedResponse.headers.set('CF-Cache-Status', 'HIT');
    
    // Verificar se precisamos revalidar em background
    const age = parseInt(response.headers.get('Age') || '0');
    if (age >= cacheConfig.staleWhileRevalidateAge) {
      // Revalidar em background sem bloquear
      context.waitUntil(revalidateCache(cacheKey, cacheConfig, context, next, cache));
    }
    
    return cachedResponse;
  }
  
  // Cache miss - obter nova resposta
  response = await next();
  
  // Só armazenar em cache se for 200 OK
  if (response.status === 200) {
    // Adicionar headers de cache
    const clonedResponse = new Response(response.body, response);
    configureCacheHeaders(clonedResponse.headers, cacheConfig);
    clonedResponse.headers.set('CF-Cache-Status', 'MISS');
    
    // Armazenar no cache edge
    context.waitUntil(cache.put(cacheKey, clonedResponse.clone()));
    
    return clonedResponse;
  }
  
  return response;
};

/**
 * Revalida o cache em background
 */
async function revalidateCache(cacheKey, cacheConfig, context, next, cache) {
  try {
    // Obter nova resposta do server
    const freshResponse = await next();
    
    // Se a resposta for válida, atualizar o cache
    if (freshResponse.status === 200) {
      const clonedResponse = new Response(freshResponse.body, freshResponse);
      configureCacheHeaders(clonedResponse.headers, cacheConfig);
      clonedResponse.headers.set('CF-Cache-Status', 'REVALIDATED');
      
      await cache.put(cacheKey, clonedResponse);
    }
  } catch (error) {
    console.error('Erro ao revalidar cache:', error);
    // Em caso de erro, manter o cache antigo
  }
}

/**
 * Configura headers de cache na resposta
 */
function configureCacheHeaders(headers, cacheConfig) {
  // Definir diretivas de cache
  let cacheControl = `public, max-age=${cacheConfig.maxAge}`;
  
  // Adicionar stale-while-revalidate se configurado
  if (cacheConfig.staleWhileRevalidate) {
    cacheControl += `, stale-while-revalidate=${cacheConfig.staleWhileRevalidate}`;
  }
  
  // Adicionar s-maxage para CDN
  if (cacheConfig.sMaxAge) {
    cacheControl += `, s-maxage=${cacheConfig.sMaxAge}`;
  }
  
  // Setar o cabeçalho
  headers.set('Cache-Control', cacheControl);
  
  // Adicionar tag para variação
  headers.set('Vary', 'Accept-Encoding, Accept');
  
  // Adicionar timestamp para debug
  headers.set('X-Cache-Timestamp', new Date().toISOString());
}

/**
 * Determina a configuração de cache baseada no path
 */
function getCacheConfig(pathname) {
  // Recursos estáticos (CSS, JS, imagens)
  if (pathname.startsWith('/_astro/')) {
    return {
      cacheable: true,
      maxAge: 31536000, // 1 ano
      sMaxAge: 31536000,
      version: '1',
      staleWhileRevalidate: 0, // Recursos estáticos não precisam de revalidação
      staleWhileRevalidateAge: Infinity
    };
  }
  
  // Imagens e outros recursos estáticos
  if (/\.(jpg|jpeg|png|gif|webp|svg|ico|woff2|woff|ttf|eot)$/.test(pathname)) {
    return {
      cacheable: true,
      maxAge: 604800, // 1 semana
      sMaxAge: 604800,
      version: '1',
      staleWhileRevalidate: 0,
      staleWhileRevalidateAge: Infinity
    };
  }
  
  // Páginas de produto individuais (alto TTL, stale-while-revalidate)
  if (pathname.startsWith('/produto/')) {
    return {
      cacheable: true,
      maxAge: 3600, // 1 hora
      sMaxAge: 86400, // 1 dia no edge
      version: '1',
      staleWhileRevalidate: 86400, // 1 dia
      staleWhileRevalidateAge: 3600 // Revalidar após 1 hora
    };
  }
  
  // Páginas de categoria/listagem (médio TTL, stale-while-revalidate)
  if (pathname.startsWith('/produtos/')) {
    return {
      cacheable: true,
      maxAge: 1800, // 30 minutos
      sMaxAge: 7200, // 2 horas no edge
      version: '1',
      staleWhileRevalidate: 7200, // 2 horas
      staleWhileRevalidateAge: 1800 // Revalidar após 30 minutos
    };
  }
  
  // Homepage
  if (pathname === '/' || pathname === '/index.html') {
    return {
      cacheable: true,
      maxAge: 300, // 5 minutos
      sMaxAge: 3600, // 1 hora no edge
      version: '1',
      staleWhileRevalidate: 3600, // 1 hora
      staleWhileRevalidateAge: 300 // Revalidar após 5 minutos
    };
  }
  
  // Páginas estáticas/institucionais
  if (/\/(sobre|contato|faq|politica-de-privacidade)/.test(pathname)) {
    return {
      cacheable: true,
      maxAge: 3600, // 1 hora
      sMaxAge: 86400, // 1 dia no edge
      version: '1',
      staleWhileRevalidate: 86400, // 1 dia
      staleWhileRevalidateAge: 3600 // Revalidar após 1 hora
    };
  }
  
  // API JSON (baixo TTL)
  if (pathname.startsWith('/api/') && !pathname.includes('/api/cart')) {
    return {
      cacheable: true,
      maxAge: 60, // 1 minuto
      sMaxAge: 300, // 5 minutos no edge
      version: '1',
      staleWhileRevalidate: 600, // 10 minutos
      staleWhileRevalidateAge: 60 // Revalidar após 1 minuto
    };
  }
  
  // Default: não cachear
  return {
    cacheable: false
  };
}