/**
 * Middleware para gerenciamento avançado de cache
 * 
 * Este middleware implementa uma estratégia de cache de múltiplos níveis otimizada para Cloudflare:
 * 1. Cache no navegador (via Cache-Control)
 * 2. Cache no edge da Cloudflare (via Cache API)
 * 3. Cache em KV Storage para dados frequentemente acessados
 * 
 * Utiliza patterns modernos como stale-while-revalidate para manter
 * a performance mesmo durante atualizações de dados.
 */

export const onRequest = async (context, next) => {
  // Extrair URL, método e outros parâmetros da requisição
  const { request, env } = context;
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
    '/carrinho',
    '/sign-in',
    '/sign-up',
    '/sign-out',
    '/dashboard',
    '/verify-email',
    '/forgot-password'
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
  const cacheKey = generateCacheKey(request, cacheConfig);
  
  // Verificar se temos em cache de KV para rotas de alta prioridade
  if (env?.CACHE_KV && cacheConfig.useKVCache) {
    try {
      const kvCache = await env.CACHE_KV.get(cacheKey.toString(), { type: 'stream' });
      if (kvCache) {
        const headers = new Headers({
          'Cache-Control': configureCacheControl(cacheConfig),
          'Content-Type': inferContentType(url.pathname),
          'CF-Cache-Status': 'HIT-KV',
          'X-Cache-Timestamp': new Date().toISOString(),
          'Vary': 'Accept-Encoding, Accept'
        });
        
        return new Response(kvCache, { headers });
      }
    } catch (error) {
      console.error('Erro ao acessar KV Cache:', error);
    }
  }
  
  // Verificar se temos em cache da Cloudflare
  const cache = caches.default;
  let response = await cache.match(cacheKey);
  
  // Se temos resposta em cache
  if (response) {
    // Adicionar header para indicar hit de cache
    const cachedResponse = new Response(response.body, response);
    cachedResponse.headers.set('CF-Cache-Status', 'HIT');
    
    // Verificar se precisamos revalidar em background
    if (shouldRevalidate(response, cacheConfig)) {
      // Revalidar em background sem bloquear
      context.waitUntil(revalidateCache(cacheKey, cacheConfig, context, next, cache, env));
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
    const responseToCache = clonedResponse.clone();
    context.waitUntil(cache.put(cacheKey, responseToCache));
    
    // Armazenar no KV Storage para rotas prioritárias
    if (env?.CACHE_KV && cacheConfig.useKVCache) {
      const responseForKV = clonedResponse.clone();
      const responseBody = await responseForKV.arrayBuffer();
      
      context.waitUntil(
        env.CACHE_KV.put(
          cacheKey.toString(), 
          responseBody, 
          { expirationTtl: cacheConfig.kvTtl || cacheConfig.sMaxAge || 3600 }
        )
      );
    }
    
    return clonedResponse;
  }
  
  return response;
};

/**
 * Verifica se o cache deve ser revalidado
 */
function shouldRevalidate(response, cacheConfig) {
  // Verificar idade do cache
  const cacheTimestamp = response.headers.get('X-Cache-Timestamp');
  if (!cacheTimestamp) return false;
  
  const cacheDate = new Date(cacheTimestamp);
  const now = new Date();
  const ageInSeconds = (now.getTime() - cacheDate.getTime()) / 1000;
  
  return ageInSeconds >= (cacheConfig.staleWhileRevalidateAge || Infinity);
}

/**
 * Gera uma chave de cache única
 */
function generateCacheKey(request, cacheConfig) {
  const url = new URL(request.url);
  
  // Adicionar variações relevantes à URL para criar chave única
  const variations = [];
  
  // Versão de cache para controle de invalidação
  variations.push(`v=${cacheConfig.version || '1'}`);
  
  // Variação por Accept para negociação de conteúdo
  const accept = request.headers.get('Accept');
  if (accept && accept.includes('text/html')) {
    variations.push(`accept=${encodeURIComponent(accept)}`);
  }
  
  // Variação por Accept-Encoding
  const acceptEncoding = request.headers.get('Accept-Encoding');
  if (acceptEncoding) {
    variations.push(`ae=${encodeURIComponent(acceptEncoding)}`);
  }
  
  // Construir URL com variações
  let cacheUrl = url.toString();
  if (variations.length > 0) {
    const separator = url.search ? '&' : '?';
    cacheUrl += `${separator}_cache=${variations.join('&')}`;
  }
  
  return new Request(cacheUrl, {
    method: 'GET'
  });
}

/**
 * Revalida o cache em background
 */
async function revalidateCache(cacheKey, cacheConfig, context, next, cache, env) {
  try {
    // Obter nova resposta do server
    const freshResponse = await next();
    
    // Se a resposta for válida, atualizar o cache
    if (freshResponse.status === 200) {
      const clonedResponse = new Response(freshResponse.body, freshResponse);
      configureCacheHeaders(clonedResponse.headers, cacheConfig);
      clonedResponse.headers.set('CF-Cache-Status', 'REVALIDATED');
      
      // Atualizar o cache edge
      await cache.put(cacheKey, clonedResponse.clone());
      
      // Atualizar KV Storage se aplicável
      if (env?.CACHE_KV && cacheConfig.useKVCache) {
        const responseForKV = clonedResponse.clone();
        const responseBody = await responseForKV.arrayBuffer();
        
        await env.CACHE_KV.put(
          cacheKey.toString(), 
          responseBody, 
          { expirationTtl: cacheConfig.kvTtl || cacheConfig.sMaxAge || 3600 }
        );
      }
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
  // Configurar Cache-Control
  headers.set('Cache-Control', configureCacheControl(cacheConfig));
  
  // Adicionar tag para variação
  headers.set('Vary', 'Accept-Encoding, Accept');
  
  // Adicionar timestamp para debug e controle de stale
  headers.set('X-Cache-Timestamp', new Date().toISOString());
}

/**
 * Gera a string de Cache-Control baseada na configuração
 */
function configureCacheControl(cacheConfig) {
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
  
  // Adicionar imutabilidade para recursos estáticos
  if (cacheConfig.immutable) {
    cacheControl += ', immutable';
  }
  
  return cacheControl;
}

/**
 * Infere o Content-Type baseado na extensão do arquivo
 */
function inferContentType(pathname) {
  const ext = pathname.split('.').pop().toLowerCase();
  
  const mimeTypes = {
    'html': 'text/html; charset=utf-8',
    'css': 'text/css; charset=utf-8',
    'js': 'application/javascript',
    'json': 'application/json',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'woff': 'font/woff',
    'woff2': 'font/woff2',
    'ttf': 'font/ttf',
    'eot': 'application/vnd.ms-fontobject',
    'ico': 'image/x-icon',
  };
  
  return mimeTypes[ext] || 'text/html; charset=utf-8';
}

/**
 * Determina a configuração de cache baseada no path
 */
function getCacheConfig(pathname) {
  // Recursos estáticos (CSS, JS, fontes)
  if (pathname.startsWith('/_astro/')) {
    return {
      cacheable: true,
      maxAge: 31536000, // 1 ano
      sMaxAge: 31536000,
      version: '1',
      immutable: true,
      staleWhileRevalidate: 0,
      staleWhileRevalidateAge: Infinity,
      useKVCache: false // Não precisa de KV, pois o cache do CDN é eficiente
    };
  }
  
  // Imagens e outros recursos estáticos
  if (/\.(jpg|jpeg|png|gif|webp|svg|ico|woff2|woff|ttf|eot)$/.test(pathname)) {
    return {
      cacheable: true,
      maxAge: 604800, // 1 semana
      sMaxAge: 604800,
      version: '1',
      immutable: false,
      staleWhileRevalidate: 0,
      staleWhileRevalidateAge: Infinity,
      useKVCache: false
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
      staleWhileRevalidateAge: 3600, // Revalidar após 1 hora
      useKVCache: true, // Armazenar no KV para acesso ultrarrápido
      kvTtl: 7200 // 2 horas no KV
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
      staleWhileRevalidateAge: 1800, // Revalidar após 30 minutos
      useKVCache: true, // Armazenar no KV para acesso rápido
      kvTtl: 3600 // 1 hora no KV
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
      staleWhileRevalidateAge: 300, // Revalidar após 5 minutos
      useKVCache: true, // Prioridade alta para KV
      kvTtl: 600 // 10 minutos no KV
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
      staleWhileRevalidateAge: 3600, // Revalidar após 1 hora
      useKVCache: false // Não priorizar KV para conteúdo menos acessado
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
      staleWhileRevalidateAge: 60, // Revalidar após 1 minuto
      useKVCache: pathname.includes('/api/search') || pathname.includes('/api/product'), // KV para APIs críticas
      kvTtl: 120 // 2 minutos no KV
    };
  }
  
  // Default: não cachear
  return {
    cacheable: false
  };
}