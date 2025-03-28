/**
 * Worker para cache avançado de dados de produto
 * 
 * Implementa cache de dados de produto em KV Storage com diferentes TTLs
 * baseados na popularidade, período do dia e outros fatores.
 * 
 * Características:
 * - Cache por ID de produto
 * - Cache por slug de produto
 * - Cache de categorias e navegação
 * - Invalidação seletiva por tag
 * - Warm-up inteligente para produtos populares
 * - Cache eficiente de componentes HTML pré-renderizados
 * - Estratégia stale-while-revalidate para produtos altamente acessados
 * - Métricas e analytics de performance
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // 1. Cache para endpoints de detalhes de produto
    if (path.startsWith('/api/product-data/')) {
      return await handleProductData(request, env, ctx);
    }
    
    // 2. Cache para endpoints de categoria
    if (path.startsWith('/api/categories')) {
      return await handleCategoryData(request, env, ctx);
    }
    
    // 3. Cache para produtos em destaque
    if (path.startsWith('/api/featured-products')) {
      return await handleFeaturedProducts(request, env, ctx);
    }
    
    // 4. Cache para componentes de produto pré-renderizados
    if (path.startsWith('/api/product-component/')) {
      return await handleProductComponent(request, env, ctx);
    }
    
    // 5. Cache para prateleiras e carrosséis de produtos
    if (path.startsWith('/api/product-shelf/')) {
      return await handleProductShelf(request, env, ctx);
    }
    
    // 6. Endpoint para métricas e performance
    if (path === '/api/product-cache/metrics' && request.method === 'GET') {
      return await handleCacheMetrics(request, env, ctx);
    }
    
    // 7. Endpoint para warm-up de cache
    if (path === '/api/cache/warm-up' && request.method === 'POST') {
      return await handleCacheWarmUp(request, env, ctx);
    }
    
    // 8. Endpoint para invalidação de cache
    if (path === '/api/cache/invalidate' && request.method === 'POST') {
      return await handleCacheInvalidation(request, env, ctx);
    }
    
    // Rota não encontrada
    return new Response('Endpoint não encontrado', { status: 404 });
  },
  
  // Executar tarefas agendadas
  async scheduled(event, env, ctx) {
    // Cache warm-up diário para produtos populares às 3 da manhã
    if (event.cron === '0 3 * * *') {
      await warmUpPopularProducts(env);
    }
    
    // Limpeza de cache expirado aos domingos às 2 da manhã
    if (event.cron === '0 2 * * 0') {
      await cleanupExpiredCache(env);
    }
    
    // Atualiza métricas de cache a cada 6 horas
    if (event.cron === '0 */6 * * *') {
      await updateCacheMetrics(env);
    }
    
    // Pré-renderiza componentes para produtos em destaque
    if (event.cron === '0 4 * * *') {
      await prerenderFeaturedProductComponents(env);
    }
  }
};

/**
 * Handler para API de detalhes de produto
 */
async function handleProductData(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // Extrair ID ou slug do produto da URL
  const idOrSlugMatch = path.match(/\/api\/product-data\/([^\/]+)$/);
  if (!idOrSlugMatch) {
    return new Response('ID ou slug do produto não encontrado', { status: 400 });
  }
  
  const idOrSlug = idOrSlugMatch[1];
  const isNumeric = /^\d+$/.test(idOrSlug);
  
  // Gerar chave de cache
  const cacheKey = isNumeric 
    ? `product:id:${idOrSlug}` 
    : `product:slug:${idOrSlug}`;
  
  // Verificar se temos em cache
  const cachedProduct = await env.PRODUCT_CACHE.get(cacheKey, { type: 'json' });
  
  if (cachedProduct) {
    // Registrar analytics de cache hit em background
    ctx.waitUntil(registerCacheHit(cacheKey, env));
    
    // Verificar se está perto de expirar para revalidar em background
    const { ttl } = await env.PRODUCT_CACHE.getWithMetadata(cacheKey, { type: 'json' }) || { ttl: 0 };
    if (ttl < 600) { // Menos de 10 minutos para expirar
      ctx.waitUntil(revalidateProductCache(idOrSlug, isNumeric, env));
    }
    
    return jsonResponse(cachedProduct, 200, {
      'CF-Cache-Status': 'HIT',
      'Cache-Control': 'public, max-age=60, s-maxage=300'
    });
  }
  
  // Cache miss - buscar dados frescos
  try {
    // Buscar dados do produto do backend (Turso)
    const product = await fetchProductFromBackend(idOrSlug, isNumeric, env);
    
    if (!product) {
      return new Response('Produto não encontrado', { status: 404 });
    }
    
    // Determinar TTL baseado em popularidade
    const popularity = await getProductPopularity(idOrSlug, env);
    const ttl = calculateCacheTTL(product, popularity);
    
    // Armazenar em cache
    await env.PRODUCT_CACHE.put(cacheKey, JSON.stringify(product), { expirationTtl: ttl });
    
    // Também armazenar em cache cruzado (por ID e por slug)
    if (isNumeric && product.slug) {
      await env.PRODUCT_CACHE.put(`product:slug:${product.slug}`, JSON.stringify(product), { expirationTtl: ttl });
    } else if (!isNumeric && product.id) {
      await env.PRODUCT_CACHE.put(`product:id:${product.id}`, JSON.stringify(product), { expirationTtl: ttl });
    }
    
    // Registrar analytics de cache miss em background
    ctx.waitUntil(registerCacheMiss(cacheKey, env));
    
    return jsonResponse(product, 200, {
      'CF-Cache-Status': 'MISS',
      'Cache-Control': 'public, max-age=60, s-maxage=300'
    });
  } catch (error) {
    console.error('Erro ao buscar produto:', error);
    return new Response('Erro ao buscar dados do produto', { status: 500 });
  }
}

/**
 * Handler para API de categorias
 */
async function handleCategoryData(request, env, ctx) {
  const url = new URL(request.url);
  const queryParams = url.searchParams.toString();
  const cacheKey = `categories:${queryParams || 'all'}`;
  
  // Verificar se temos em cache
  const cachedCategories = await env.PRODUCT_CACHE.get(cacheKey, { type: 'json' });
  
  if (cachedCategories) {
    return jsonResponse(cachedCategories, 200, {
      'CF-Cache-Status': 'HIT',
      'Cache-Control': 'public, max-age=300, s-maxage=3600'
    });
  }
  
  // Cache miss - buscar dados frescos
  try {
    // Buscar categorias do backend
    const categories = await fetchCategoriesFromBackend(url.searchParams, env);
    
    // Armazenar em cache com TTL longo (categorias mudam pouco)
    await env.PRODUCT_CACHE.put(cacheKey, JSON.stringify(categories), { expirationTtl: 86400 }); // 24 horas
    
    return jsonResponse(categories, 200, {
      'CF-Cache-Status': 'MISS',
      'Cache-Control': 'public, max-age=300, s-maxage=3600'
    });
  } catch (error) {
    console.error('Erro ao buscar categorias:', error);
    return new Response('Erro ao buscar dados de categorias', { status: 500 });
  }
}

/**
 * Handler para API de produtos em destaque
 */
async function handleFeaturedProducts(request, env, ctx) {
  const url = new URL(request.url);
  const cacheKey = `featured:${url.searchParams.toString() || 'default'}`;
  
  // Verificar se temos em cache
  const cachedProducts = await env.PRODUCT_CACHE.get(cacheKey, { type: 'json' });
  
  if (cachedProducts) {
    return jsonResponse(cachedProducts, 200, {
      'CF-Cache-Status': 'HIT',
      'Cache-Control': 'public, max-age=60, s-maxage=900'
    });
  }
  
  // Cache miss - buscar dados frescos
  try {
    // Buscar produtos em destaque do backend
    const featuredProducts = await fetchFeaturedFromBackend(url.searchParams, env);
    
    // Armazenar em cache com TTL médio (produtos destacados mudam com frequência moderada)
    await env.PRODUCT_CACHE.put(cacheKey, JSON.stringify(featuredProducts), { expirationTtl: 3600 }); // 1 hora
    
    return jsonResponse(featuredProducts, 200, {
      'CF-Cache-Status': 'MISS',
      'Cache-Control': 'public, max-age=60, s-maxage=900'
    });
  } catch (error) {
    console.error('Erro ao buscar produtos em destaque:', error);
    return new Response('Erro ao buscar produtos em destaque', { status: 500 });
  }
}

/**
 * Handler para warm-up de cache
 */
async function handleCacheWarmUp(request, env, ctx) {
  try {
    const data = await request.json();
    const { productIds, categoryIds, authorization } = data;
    
    // Verificar autorização
    const expectedToken = env.CACHE_AUTH_TOKEN;
    if (authorization !== `Bearer ${expectedToken}`) {
      return new Response('Não autorizado', { status: 401 });
    }
    
    // Iniciar warm-up em background
    ctx.waitUntil(warmUpCache(productIds, categoryIds, env));
    
    return jsonResponse({ success: true, message: 'Cache warm-up iniciado' });
  } catch (error) {
    console.error('Erro ao iniciar warm-up de cache:', error);
    return new Response('Erro ao processar requisição', { status: 500 });
  }
}

/**
 * Handler para invalidação de cache
 */
async function handleCacheInvalidation(request, env, ctx) {
  try {
    const data = await request.json();
    const { productIds, categoryIds, tags, authorization } = data;
    
    // Verificar autorização
    const expectedToken = env.CACHE_AUTH_TOKEN;
    if (authorization !== `Bearer ${expectedToken}`) {
      return new Response('Não autorizado', { status: 401 });
    }
    
    // Iniciar invalidação em background
    ctx.waitUntil(invalidateCache(productIds, categoryIds, tags, env));
    
    return jsonResponse({ success: true, message: 'Invalidação de cache iniciada' });
  } catch (error) {
    console.error('Erro ao iniciar invalidação de cache:', error);
    return new Response('Erro ao processar requisição', { status: 500 });
  }
}

/**
 * Função para warm-up de cache
 */
async function warmUpCache(productIds, categoryIds, env) {
  const tasks = [];
  
  // Pre-aquecer produtos individuais
  if (productIds && productIds.length > 0) {
    for (const id of productIds) {
      tasks.push(fetchProductFromBackend(id, true, env).then(product => {
        if (!product) return null;
        
        // Calcular TTL baseado em popularidade
        return getProductPopularity(id, env).then(popularity => {
          const ttl = calculateCacheTTL(product, popularity);
          
          // Armazenar em cache por ID
          env.PRODUCT_CACHE.put(`product:id:${id}`, JSON.stringify(product), { expirationTtl: ttl });
          
          // Também armazenar em cache por slug
          if (product.slug) {
            env.PRODUCT_CACHE.put(`product:slug:${product.slug}`, JSON.stringify(product), { expirationTtl: ttl });
          }
          
          return id;
        });
      }));
    }
  }
  
  // Pre-aquecer categorias
  if (categoryIds && categoryIds.length > 0) {
    tasks.push(fetchCategoriesFromBackend({ ids: categoryIds.join(',') }, env).then(categories => {
      return env.PRODUCT_CACHE.put(`categories:custom`, JSON.stringify(categories), { expirationTtl: 86400 });
    }));
    
    // Também pre-aquecer todas as categorias
    tasks.push(fetchCategoriesFromBackend({}, env).then(categories => {
      return env.PRODUCT_CACHE.put(`categories:all`, JSON.stringify(categories), { expirationTtl: 86400 });
    }));
  }
  
  // Aguardar todos os tasks
  await Promise.all(tasks);
  
  console.log(`Cache warm-up concluído: ${productIds?.length || 0} produtos, ${categoryIds?.length || 0} categorias`);
}

/**
 * Função para invalidar cache
 */
async function invalidateCache(productIds, categoryIds, tags, env) {
  const keysToDelete = [];
  
  // Invalidar produtos por ID
  if (productIds && productIds.length > 0) {
    for (const id of productIds) {
      // Buscar o produto primeiro para obter o slug
      const product = await env.PRODUCT_CACHE.get(`product:id:${id}`, { type: 'json' });
      keysToDelete.push(`product:id:${id}`);
      
      if (product && product.slug) {
        keysToDelete.push(`product:slug:${product.slug}`);
      }
    }
  }
  
  // Invalidar por tags
  if (tags && tags.length > 0) {
    // Listar todas as chaves com o prefixo de tag
    for (const tag of tags) {
      const taggedKeys = await listKeysByTag(tag, env);
      keysToDelete.push(...taggedKeys);
    }
  }
  
  // Invalidar categorias
  if (categoryIds && categoryIds.length > 0) {
    keysToDelete.push('categories:all');
    keysToDelete.push('categories:custom');
    
    for (const id of categoryIds) {
      keysToDelete.push(`categories:${id}`);
    }
  }
  
  // Remover chaves duplicadas
  const uniqueKeys = [...new Set(keysToDelete)];
  
  // Excluir todas as chaves
  const deletePromises = uniqueKeys.map(key => env.PRODUCT_CACHE.delete(key));
  await Promise.all(deletePromises);
  
  console.log(`Cache invalidado: ${uniqueKeys.length} chaves removidas`);
}

/**
 * Busca produtos populares e faz warm-up
 */
async function warmUpPopularProducts(env) {
  try {
    // Buscar IDs de produtos populares
    const popularityData = await env.PRODUCT_CACHE.get('analytics:popular_products', { type: 'json' });
    
    if (!popularityData || !popularityData.products) {
      console.log('Dados de popularidade não encontrados para warm-up');
      return;
    }
    
    // Extrair os 50 produtos mais populares
    const popularProductIds = popularityData.products
      .sort((a, b) => b.views - a.views)
      .slice(0, 50)
      .map(item => item.id);
    
    // Fazer warm-up
    await warmUpCache(popularProductIds, [], env);
    
    console.log(`Warm-up concluído para ${popularProductIds.length} produtos populares`);
  } catch (error) {
    console.error('Erro ao executar warm-up de produtos populares:', error);
  }
}

/**
 * Limpa cache expirado ou raramente acessado
 */
async function cleanupExpiredCache(env) {
  try {
    // Este é um esboço - em produção, usaria métricas de acesso
    // para determinar quais chaves devem ser removidas
    console.log('Limpeza de cache executada');
  } catch (error) {
    console.error('Erro ao limpar cache expirado:', error);
  }
}

/**
 * Registra um hit de cache para analytics
 */
async function registerCacheHit(key, env) {
  try {
    // Extrair ID do produto da chave
    const idMatch = key.match(/product:(id|slug):(.+)$/);
    if (!idMatch) return;
    
    const productIdentifier = idMatch[2];
    
    // Incrementar contador de hits
    // Em produção, usaria um Durable Object ou contador distribuído
    console.log(`Cache hit para produto ${productIdentifier}`);
  } catch (error) {
    console.error('Erro ao registrar cache hit:', error);
  }
}

/**
 * Registra um miss de cache para analytics
 */
async function registerCacheMiss(key, env) {
  try {
    // Extrair ID do produto da chave
    const idMatch = key.match(/product:(id|slug):(.+)$/);
    if (!idMatch) return;
    
    const productIdentifier = idMatch[2];
    
    // Incrementar contador de misses
    console.log(`Cache miss para produto ${productIdentifier}`);
  } catch (error) {
    console.error('Erro ao registrar cache miss:', error);
  }
}

/**
 * Revalida o cache de um produto em background
 */
async function revalidateProductCache(idOrSlug, isNumeric, env) {
  try {
    // Buscar dados frescos
    const product = await fetchProductFromBackend(idOrSlug, isNumeric, env);
    
    if (!product) {
      console.log(`Produto ${idOrSlug} não encontrado para revalidação`);
      return;
    }
    
    // Determinar TTL baseado em popularidade
    const popularity = await getProductPopularity(idOrSlug, env);
    const ttl = calculateCacheTTL(product, popularity);
    
    // Gerar chaves de cache
    const idKey = isNumeric ? `product:id:${idOrSlug}` : `product:id:${product.id}`;
    const slugKey = isNumeric ? `product:slug:${product.slug}` : `product:slug:${idOrSlug}`;
    
    // Atualizar cache
    await env.PRODUCT_CACHE.put(idKey, JSON.stringify(product), { expirationTtl: ttl });
    await env.PRODUCT_CACHE.put(slugKey, JSON.stringify(product), { expirationTtl: ttl });
    
    console.log(`Cache revalidado para produto ${idOrSlug}`);
  } catch (error) {
    console.error(`Erro ao revalidar cache para produto ${idOrSlug}:`, error);
  }
}

// Funções auxiliares

/**
 * Calcula TTL baseado em popularidade e tipo de produto
 */
function calculateCacheTTL(product, popularity) {
  // Produtos mais populares têm TTL mais curto para manter dados frescos
  // Produtos menos populares podem ficar em cache por mais tempo
  
  // Base TTL: 1 hora (3600 segundos)
  let ttl = 3600;
  
  // Ajustar baseado na popularidade (0-100)
  if (popularity > 80) {
    // Produtos muito populares: 30 minutos
    ttl = 1800;
  } else if (popularity > 50) {
    // Produtos populares: 1 hora
    ttl = 3600;
  } else if (popularity > 20) {
    // Popularidade média: 3 horas
    ttl = 10800;
  } else {
    // Pouco populares: 6 horas
    ttl = 21600;
  }
  
  // Ajustar baseado em atributos do produto
  if (product.is_new) {
    // Produtos novos têm TTL menor
    ttl = Math.min(ttl, 1800);
  }
  
  if (product.is_on_sale) {
    // Produtos em promoção têm TTL menor
    ttl = Math.min(ttl, 1200);
  }
  
  if (product.limited_stock) {
    // Produtos com estoque limitado têm TTL menor
    ttl = Math.min(ttl, 900);
  }
  
  return ttl;
}

/**
 * Busca a popularidade de um produto (0-100)
 */
async function getProductPopularity(productId, env) {
  try {
    // Em produção, buscaria de analytics ou KV
    // Para este exemplo, retornar um valor aleatório entre 0-100
    return Math.floor(Math.random() * 100);
  } catch (error) {
    console.error('Erro ao obter popularidade do produto:', error);
    return 50; // Valor padrão médio
  }
}

/**
 * Busca produto do backend (simulado)
 */
async function fetchProductFromBackend(idOrSlug, isNumeric, env) {
  // Em produção, isso seria uma requisição para a origem ou Turso
  // Para este exemplo, retornar um produto falso
  
  return {
    id: isNumeric ? idOrSlug : '123',
    name: `Produto ${idOrSlug}`,
    description: 'Descrição detalhada do produto',
    price: 99.90,
    compare_at_price: 129.90,
    slug: isNumeric ? 'produto-exemplo' : idOrSlug,
    is_new: Math.random() > 0.8,
    is_on_sale: Math.random() > 0.7,
    limited_stock: Math.random() > 0.9,
    vendorName: 'Loja Exemplo',
    category: 'Categoria Teste',
    images: [
      {
        url: 'https://example.com/image.jpg',
        alt: 'Imagem do produto'
      }
    ]
  };
}

/**
 * Busca categorias do backend (simulado)
 */
async function fetchCategoriesFromBackend(params, env) {
  // Em produção, isso seria uma requisição para a origem ou Turso
  // Para este exemplo, retornar categorias falsas
  
  return [
    {
      id: '1',
      name: 'Categoria 1',
      slug: 'categoria-1',
      parent_id: null,
      products_count: 42
    },
    {
      id: '2',
      name: 'Categoria 2',
      slug: 'categoria-2',
      parent_id: null,
      products_count: 28
    }
  ];
}

/**
 * Busca produtos em destaque do backend (simulado)
 */
async function fetchFeaturedFromBackend(params, env) {
  // Em produção, isso seria uma requisição para a origem ou Turso
  // Para este exemplo, retornar produtos falsos
  
  return [
    {
      id: '1',
      name: 'Produto Destaque 1',
      price: 199.90,
      compare_at_price: 249.90,
      slug: 'produto-destaque-1',
      image: 'https://example.com/image1.jpg'
    },
    {
      id: '2',
      name: 'Produto Destaque 2',
      price: 149.90,
      compare_at_price: null,
      slug: 'produto-destaque-2',
      image: 'https://example.com/image2.jpg'
    }
  ];
}

/**
 * Lista chaves por tag
 */
async function listKeysByTag(tag, env) {
  // Em produção, isso usaria a API KV para listar chaves com um prefixo
  // Para este exemplo, retornar uma lista vazia
  return [];
}

/**
 * Handler para componentes de produto pré-renderizados
 * Permite cachear versões HTML de cards de produto, detalhes, etc.
 */
async function handleProductComponent(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // Extrair tipo de componente e ID do produto
  const match = path.match(/\/api\/product-component\/([^\/]+)\/([^\/]+)$/);
  if (!match) {
    return new Response('Formato de URL inválido', { status: 400 });
  }
  
  const componentType = match[1]; // Ex: 'card', 'detail', 'quickview'
  const productId = match[2];
  
  // Gerar chave de cache
  const cacheKey = `product-component:${componentType}:${productId}`;
  
  // Verificar cache
  const cachedComponent = await env.PRODUCT_CACHE.get(cacheKey);
  
  if (cachedComponent) {
    // Registrar hit de cache para analytics
    ctx.waitUntil(registerComponentCacheHit(componentType, productId, env));
    
    // Verificar se o componente precisa de revalidação
    const { metadata } = await env.PRODUCT_CACHE.getWithMetadata(cacheKey) || {};
    const now = Date.now();
    
    if (metadata && metadata.expiresAt && metadata.expiresAt < now) {
      // Revalidar em background enquanto entrega o conteúdo cacheado
      ctx.waitUntil(revalidateProductComponent(componentType, productId, env));
    }
    
    return new Response(cachedComponent, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'CF-Cache-Status': 'HIT',
        'Cache-Control': 'public, max-age=600, s-maxage=1800',
        'X-Cache-Source': 'product-component-worker'
      }
    });
  }
  
  // Cache miss - renderizar o componente
  try {
    const renderedComponent = await renderProductComponent(componentType, productId, env);
    
    if (!renderedComponent) {
      return new Response('Componente ou produto não encontrado', { status: 404 });
    }
    
    // Calcular TTL baseado no tipo de componente e popularidade
    const popularity = await getProductPopularity(productId, env);
    const ttl = getComponentTTL(componentType, popularity);
    
    // Definir quando o componente deve ser revalidado (80% do TTL)
    const expiresAt = Date.now() + (ttl * 0.8 * 1000);
    
    // Armazenar no cache
    await env.PRODUCT_CACHE.put(cacheKey, renderedComponent, { 
      expirationTtl: ttl,
      metadata: {
        productId,
        componentType,
        createdAt: Date.now(),
        expiresAt,
        popularity
      }
    });
    
    // Registrar criação para analytics
    ctx.waitUntil(registerComponentCreation(componentType, productId, env));
    
    return new Response(renderedComponent, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'CF-Cache-Status': 'MISS',
        'Cache-Control': 'public, max-age=600, s-maxage=1800',
        'X-Cache-Source': 'product-component-worker'
      }
    });
  } catch (error) {
    console.error('Erro ao renderizar componente de produto:', error);
    return new Response('Erro ao processar requisição', { status: 500 });
  }
}

/**
 * Handler para prateleiras de produtos (coleções, carrosséis, etc)
 */
async function handleProductShelf(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // Extrair tipo de prateleira (ex: featured, related, category)
  const match = path.match(/\/api\/product-shelf\/([^\/]+)$/);
  if (!match) {
    return new Response('Formato de URL inválido', { status: 400 });
  }
  
  const shelfType = match[1];
  const queryParams = url.searchParams.toString();
  
  // Gerar chave de cache
  const cacheKey = `product-shelf:${shelfType}:${queryParams || 'default'}`;
  
  // Verificar cache
  const cachedShelf = await env.PRODUCT_CACHE.get(cacheKey);
  
  if (cachedShelf) {
    // Verificar se precisa revalidação em background
    const { ttl } = await env.PRODUCT_CACHE.getWithMetadata(cacheKey, { type: 'json' }) || { ttl: 0 };
    if (ttl < 600) { // Menos de 10 minutos para expirar
      ctx.waitUntil(revalidateProductShelf(shelfType, queryParams, env));
    }
    
    return new Response(cachedShelf, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'CF-Cache-Status': 'HIT',
        'Cache-Control': 'public, max-age=300, s-maxage=1800'
      }
    });
  }
  
  // Cache miss - renderizar a prateleira
  try {
    // Renderizar prateleira com produtos
    const renderedShelf = await renderProductShelf(shelfType, url.searchParams, env);
    
    if (!renderedShelf) {
      return new Response('Prateleira não encontrada', { status: 404 });
    }
    
    // Determinar TTL baseado no tipo
    const ttl = getShelfTTL(shelfType);
    
    // Armazenar no cache
    await env.PRODUCT_CACHE.put(cacheKey, renderedShelf, { expirationTtl: ttl });
    
    return new Response(renderedShelf, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'CF-Cache-Status': 'MISS',
        'Cache-Control': 'public, max-age=300, s-maxage=1800'
      }
    });
  } catch (error) {
    console.error('Erro ao renderizar prateleira de produtos:', error);
    return new Response('Erro ao processar requisição', { status: 500 });
  }
}

/**
 * Handler para métricas de cache
 */
async function handleCacheMetrics(request, env, ctx) {
  const url = new URL(request.url);
  const auth = request.headers.get('Authorization');
  
  // Verificar autorização
  const expectedToken = env.CACHE_AUTH_TOKEN;
  if (!auth || auth !== `Bearer ${expectedToken}`) {
    return new Response('Não autorizado', { status: 401 });
  }
  
  // Determinar período
  const period = url.searchParams.get('period') || '24h';
  let timeRange;
  
  switch(period) {
    case '7d':
      timeRange = 7 * 24 * 60 * 60 * 1000; // 7 dias
      break;
    case '30d':
      timeRange = 30 * 24 * 60 * 60 * 1000; // 30 dias
      break;
    case '24h':
    default:
      timeRange = 24 * 60 * 60 * 1000; // 24 horas
  }
  
  // Coletar métricas
  try {
    // Buscar métricas do KV
    const metrics = await env.PERFORMANCE_METRICS.get('product_cache_metrics', { type: 'json' }) || {
      hits: 0,
      misses: 0,
      popular_products: [],
      components: {},
      last_updated: 0
    };
    
    // Adicionar metadados
    const result = {
      ...metrics,
      period,
      hit_ratio: calculateHitRatio(metrics.hits, metrics.misses),
      current_time: Date.now()
    };
    
    return jsonResponse(result);
  } catch (error) {
    console.error('Erro ao coletar métricas de cache:', error);
    return new Response('Erro ao coletar métricas', { status: 500 });
  }
}

/**
 * Renderiza um componente de produto
 */
async function renderProductComponent(componentType, productId, env) {
  // Em produção, isso faria uma solicitação para a origem para renderizar o componente
  // Para este exemplo, simular com HTML estático
  
  try {
    // Primeiro, buscar os dados do produto
    const product = await fetchProductFromBackend(productId, true, env);
    
    if (!product) {
      return null;
    }
    
    // Renderizar com base no tipo de componente
    switch (componentType) {
      case 'card':
        return `
          <div class="product-card" data-product-id="${product.id}">
            <a href="/produto/${product.slug}" class="product-link">
              <div class="product-image">
                <img src="https://example.com/products/${product.id}.jpg" alt="${product.name}" loading="lazy">
              </div>
              <div class="product-info">
                <h3 class="product-title">${product.name}</h3>
                <div class="product-pricing">
                  ${product.compare_at_price ? `<span class="compare-price">R$ ${product.compare_at_price.toFixed(2)}</span>` : ''}
                  <span class="price">R$ ${product.price.toFixed(2)}</span>
                </div>
              </div>
            </a>
            <button class="add-to-cart-btn" data-product-id="${product.id}">Adicionar ao Carrinho</button>
          </div>
        `;
        
      case 'detail':
        return `
          <div class="product-detail" data-product-id="${product.id}">
            <h1 class="product-title">${product.name}</h1>
            <div class="product-pricing">
              ${product.compare_at_price ? `<span class="compare-price">R$ ${product.compare_at_price.toFixed(2)}</span>` : ''}
              <span class="price">R$ ${product.price.toFixed(2)}</span>
            </div>
            <div class="product-description">${product.description}</div>
            <div class="product-actions">
              <div class="quantity-selector">
                <button class="quantity-minus">-</button>
                <input type="number" value="1" min="1" class="quantity-input">
                <button class="quantity-plus">+</button>
              </div>
              <button class="add-to-cart-btn primary" data-product-id="${product.id}">Adicionar ao Carrinho</button>
            </div>
          </div>
        `;
        
      case 'quickview':
        return `
          <div class="product-quickview" data-product-id="${product.id}">
            <div class="quickview-header">
              <h3 class="product-title">${product.name}</h3>
              <button class="close-quickview">&times;</button>
            </div>
            <div class="quickview-body">
              <div class="product-image">
                <img src="https://example.com/products/${product.id}.jpg" alt="${product.name}">
              </div>
              <div class="product-info">
                <div class="product-pricing">
                  ${product.compare_at_price ? `<span class="compare-price">R$ ${product.compare_at_price.toFixed(2)}</span>` : ''}
                  <span class="price">R$ ${product.price.toFixed(2)}</span>
                </div>
                <div class="product-short-description">${product.description.substring(0, 100)}...</div>
                <a href="/produto/${product.slug}" class="view-detail-btn">Ver Detalhes</a>
                <button class="add-to-cart-btn" data-product-id="${product.id}">Adicionar ao Carrinho</button>
              </div>
            </div>
          </div>
        `;
        
      default:
        return null;
    }
  } catch (error) {
    console.error(`Erro ao renderizar componente ${componentType} para produto ${productId}:`, error);
    return null;
  }
}

/**
 * Renderiza uma prateleira de produtos
 */
async function renderProductShelf(shelfType, params, env) {
  try {
    let products = [];
    const limit = parseInt(params.get('limit') || '4', 10);
    
    // Buscar produtos baseado no tipo de prateleira
    switch (shelfType) {
      case 'featured':
        products = await fetchFeaturedFromBackend(params, env);
        break;
      case 'related':
        const productId = params.get('productId');
        if (!productId) return null;
        products = await fetchRelatedProducts(productId, limit, env);
        break;
      case 'category':
        const categoryId = params.get('categoryId');
        if (!categoryId) return null;
        products = await fetchCategoryProducts(categoryId, limit, env);
        break;
      case 'new':
        products = await fetchNewProducts(limit, env);
        break;
      default:
        return null;
    }
    
    if (!products || products.length === 0) {
      return null;
    }
    
    // Gerar título da prateleira
    let title = '';
    switch (shelfType) {
      case 'featured': title = 'Produtos em Destaque'; break;
      case 'related': title = 'Produtos Relacionados'; break;
      case 'category': title = `Produtos da Categoria`; break;
      case 'new': title = 'Novidades'; break;
    }
    
    // Renderizar o HTML da prateleira
    const shelfHTML = `
      <div class="product-shelf product-shelf-${shelfType}">
        <div class="shelf-header">
          <h2 class="shelf-title">${title}</h2>
          ${shelfType !== 'related' ? '<a href="/produtos" class="view-all">Ver Todos</a>' : ''}
        </div>
        <div class="shelf-body">
          <div class="product-grid">
            ${products.map(product => `
              <div class="product-card" data-product-id="${product.id}">
                <a href="/produto/${product.slug}" class="product-link">
                  <div class="product-image">
                    <img src="${product.image}" alt="${product.name}" loading="lazy">
                  </div>
                  <div class="product-info">
                    <h3 class="product-title">${product.name}</h3>
                    <div class="product-pricing">
                      ${product.compare_at_price ? `<span class="compare-price">R$ ${product.compare_at_price.toFixed(2)}</span>` : ''}
                      <span class="price">R$ ${product.price.toFixed(2)}</span>
                    </div>
                  </div>
                </a>
                <button class="add-to-cart-btn" data-product-id="${product.id}">Adicionar ao Carrinho</button>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
    
    return shelfHTML;
  } catch (error) {
    console.error(`Erro ao renderizar prateleira ${shelfType}:`, error);
    return null;
  }
}

/**
 * Atualiza métricas de cache periodicamente
 */
async function updateCacheMetrics(env) {
  try {
    // Obter métricas atuais
    const currentMetrics = await env.PERFORMANCE_METRICS.get('product_cache_metrics', { type: 'json' }) || {
      hits: 0,
      misses: 0,
      components: {},
      popular_products: [],
      last_updated: 0
    };
    
    // Atualizar com dados de acesso das últimas 24h
    const todayKey = getYYYYMMDD();
    
    // Obter contadores de hits/misses
    const hitsToday = await env.PERFORMANCE_METRICS.get(`cache_hits:${todayKey}`, { type: 'json' }) || { count: 0 };
    const missesToday = await env.PERFORMANCE_METRICS.get(`cache_misses:${todayKey}`, { type: 'json' }) || { count: 0 };
    
    // Atualizar métricas globais
    currentMetrics.hits += hitsToday.count;
    currentMetrics.misses += missesToday.count;
    currentMetrics.last_updated = Date.now();
    
    // Atualizar métricas por tipo de componente
    const componentTypes = ['card', 'detail', 'quickview'];
    for (const type of componentTypes) {
      const typeHits = await env.PERFORMANCE_METRICS.get(`component_hits:${type}:${todayKey}`, { type: 'json' }) || { count: 0 };
      
      if (!currentMetrics.components[type]) {
        currentMetrics.components[type] = { hits: 0, misses: 0 };
      }
      
      currentMetrics.components[type].hits += typeHits.count;
    }
    
    // Buscar produtos populares
    const popularProductsData = await getPopularProductsData(env);
    
    if (popularProductsData && popularProductsData.length > 0) {
      currentMetrics.popular_products = popularProductsData.slice(0, 20);
    }
    
    // Salvar métricas atualizadas
    await env.PERFORMANCE_METRICS.put('product_cache_metrics', JSON.stringify(currentMetrics), {
      expirationTtl: 86400 * 30 // 30 dias
    });
    
    console.log('Métricas de cache atualizadas');
  } catch (error) {
    console.error('Erro ao atualizar métricas de cache:', error);
  }
}

/**
 * Pré-renderiza componentes para produtos populares/destacados
 */
async function prerenderFeaturedProductComponents(env) {
  try {
    // Obter IDs de produtos destacados e populares
    const featuredProducts = await fetchFeaturedFromBackend({}, env);
    const popularProductsData = await getPopularProductsData(env);
    
    if (!featuredProducts || featuredProducts.length === 0) {
      console.log('Nenhum produto em destaque encontrado para pré-renderização');
      return;
    }
    
    // Combinar IDs de produtos, removendo duplicatas
    const productIds = [...new Set([
      ...featuredProducts.map(p => p.id),
      ...popularProductsData.slice(0, 10).map(p => p.id)
    ])];
    
    console.log(`Iniciando pré-renderização de componentes para ${productIds.length} produtos`);
    
    // Tipos de componentes a pré-renderizar
    const componentTypes = ['card', 'detail', 'quickview'];
    
    // Renderizar cada componente para cada produto
    const tasks = [];
    
    for (const productId of productIds) {
      for (const componentType of componentTypes) {
        tasks.push(
          (async () => {
            try {
              // Renderizar componente
              const renderedComponent = await renderProductComponent(componentType, productId, env);
              
              if (!renderedComponent) {
                console.log(`Falha ao renderizar ${componentType} para produto ${productId}`);
                return;
              }
              
              // Calcular TTL e popularidade
              const popularity = await getProductPopularity(productId, env);
              const ttl = getComponentTTL(componentType, popularity);
              
              // Gerar chave de cache
              const cacheKey = `product-component:${componentType}:${productId}`;
              
              // Armazenar no cache
              await env.PRODUCT_CACHE.put(cacheKey, renderedComponent, { 
                expirationTtl: ttl,
                metadata: {
                  productId,
                  componentType,
                  createdAt: Date.now(),
                  popularity
                }
              });
              
              console.log(`Componente ${componentType} pré-renderizado para produto ${productId}`);
            } catch (e) {
              console.error(`Erro ao pré-renderizar ${componentType} para produto ${productId}:`, e);
            }
          })()
        );
      }
    }
    
    // Aguardar a conclusão de todas as tasks
    await Promise.all(tasks);
    
    console.log(`Pré-renderização de ${productIds.length * componentTypes.length} componentes concluída`);
  } catch (error) {
    console.error('Erro ao pré-renderizar componentes de produtos:', error);
  }
}

/**
 * Registra hit de cache de componente para analytics
 */
async function registerComponentCacheHit(componentType, productId, env) {
  try {
    const today = getYYYYMMDD();
    
    // Incrementar contador global de hits
    await incrementCounter(`cache_hits:${today}`, env);
    
    // Incrementar contador por tipo de componente
    await incrementCounter(`component_hits:${componentType}:${today}`, env);
    
    // Incrementar contador por produto
    await incrementCounter(`product_hits:${productId}:${today}`, env);
  } catch (error) {
    console.error('Erro ao registrar hit de cache:', error);
  }
}

/**
 * Registra criação de componente para analytics
 */
async function registerComponentCreation(componentType, productId, env) {
  try {
    const today = getYYYYMMDD();
    
    // Incrementar contador global de misses
    await incrementCounter(`cache_misses:${today}`, env);
    
    // Incrementar contador por tipo de componente
    await incrementCounter(`component_misses:${componentType}:${today}`, env);
    
    // Incrementar contador por produto
    await incrementCounter(`product_misses:${productId}:${today}`, env);
  } catch (error) {
    console.error('Erro ao registrar criação de componente:', error);
  }
}

/**
 * Revalida um componente de produto em background
 */
async function revalidateProductComponent(componentType, productId, env) {
  try {
    // Renderizar novo componente
    const renderedComponent = await renderProductComponent(componentType, productId, env);
    
    if (!renderedComponent) {
      console.error(`Falha ao revalidar componente ${componentType} para produto ${productId}`);
      return;
    }
    
    // Calcular TTL e popularidade
    const popularity = await getProductPopularity(productId, env);
    const ttl = getComponentTTL(componentType, popularity);
    
    // Gerar chave de cache
    const cacheKey = `product-component:${componentType}:${productId}`;
    
    // Armazenar no cache
    await env.PRODUCT_CACHE.put(cacheKey, renderedComponent, { 
      expirationTtl: ttl,
      metadata: {
        productId,
        componentType,
        createdAt: Date.now(),
        popularity
      }
    });
    
    console.log(`Componente ${componentType} revalidado para produto ${productId}`);
  } catch (error) {
    console.error(`Erro ao revalidar componente ${componentType} para produto ${productId}:`, error);
  }
}

/**
 * Revalida uma prateleira de produtos em background
 */
async function revalidateProductShelf(shelfType, queryParams, env) {
  try {
    // Gerar novo HTML da prateleira
    const renderedShelf = await renderProductShelf(shelfType, new URLSearchParams(queryParams), env);
    
    if (!renderedShelf) {
      console.error(`Falha ao revalidar prateleira ${shelfType}`);
      return;
    }
    
    // Gerar chave de cache
    const cacheKey = `product-shelf:${shelfType}:${queryParams || 'default'}`;
    
    // Determinar TTL baseado no tipo
    const ttl = getShelfTTL(shelfType);
    
    // Armazenar no cache
    await env.PRODUCT_CACHE.put(cacheKey, renderedShelf, { expirationTtl: ttl });
    
    console.log(`Prateleira ${shelfType} revalidada`);
  } catch (error) {
    console.error(`Erro ao revalidar prateleira ${shelfType}:`, error);
  }
}

/**
 * Incrementa um contador em KV
 */
async function incrementCounter(key, env) {
  try {
    // Ler valor atual
    const current = await env.PERFORMANCE_METRICS.get(key, { type: 'json' }) || { count: 0 };
    
    // Incrementar
    current.count += 1;
    
    // Atualizar
    await env.PERFORMANCE_METRICS.put(key, JSON.stringify(current), { 
      expirationTtl: 86400 * 30 // 30 dias
    });
  } catch (error) {
    console.error(`Erro ao incrementar contador ${key}:`, error);
  }
}

/**
 * Calcula o TTL para cada tipo de componente
 */
function getComponentTTL(componentType, popularity) {
  // TTL base por componente
  const baseTTL = {
    'card': 3600, // 1 hora
    'detail': 7200, // 2 horas
    'quickview': 3600 // 1 hora
  };
  
  const ttl = baseTTL[componentType] || 3600;
  
  // Ajustar por popularidade (0-100)
  // Quanto mais popular, menor o TTL para manter frescos
  if (popularity > 80) {
    return Math.floor(ttl * 0.5); // 50% para muito populares
  } else if (popularity > 50) {
    return Math.floor(ttl * 0.7); // 70% para populares
  } else if (popularity > 20) {
    return ttl; // TTL padrão para média popularidade
  } else {
    return Math.floor(ttl * 1.5); // 150% para pouco populares
  }
}

/**
 * Calcula o TTL para prateleiras de produtos
 */
function getShelfTTL(shelfType) {
  switch (shelfType) {
    case 'featured':
      return 1800; // 30 minutos
    case 'new':
      return 3600; // 1 hora
    case 'related':
      return 7200; // 2 horas
    case 'category':
      return 3600; // 1 hora
    default:
      return 3600; // 1 hora
  }
}

/**
 * Busca produtos relacionados a um produto (simulado)
 */
async function fetchRelatedProducts(productId, limit, env) {
  // Em produção, isso seria uma solicitação para origem ou lógica para determinar produtos relacionados
  return Array.from({ length: limit }, (_, i) => ({
    id: `${100 + i}`,
    name: `Produto Relacionado ${i + 1}`,
    price: 99.90,
    compare_at_price: i % 2 === 0 ? 129.90 : null,
    slug: `produto-relacionado-${i + 1}`,
    image: `https://example.com/products/${100 + i}.jpg`
  }));
}

/**
 * Busca produtos de uma categoria (simulado)
 */
async function fetchCategoryProducts(categoryId, limit, env) {
  // Em produção, isso seria uma solicitação para origem ou banco de dados
  return Array.from({ length: limit }, (_, i) => ({
    id: `${200 + i}`,
    name: `Produto da Categoria ${categoryId} - ${i + 1}`,
    price: 79.90,
    compare_at_price: i % 3 === 0 ? 99.90 : null,
    slug: `produto-categoria-${categoryId}-${i + 1}`,
    image: `https://example.com/products/${200 + i}.jpg`
  }));
}

/**
 * Busca produtos novos (simulado)
 */
async function fetchNewProducts(limit, env) {
  // Em produção, isso seria uma solicitação para origem ou banco de dados
  return Array.from({ length: limit }, (_, i) => ({
    id: `${300 + i}`,
    name: `Produto Novo ${i + 1}`,
    price: 149.90,
    compare_at_price: i % 2 === 0 ? 199.90 : null,
    slug: `produto-novo-${i + 1}`,
    image: `https://example.com/products/${300 + i}.jpg`
  }));
}

/**
 * Busca dados de produtos populares
 */
async function getPopularProductsData(env) {
  try {
    // Buscar dados de hits por produto do último período
    const today = getYYYYMMDD();
    const yesterday = getYYYYMMDD(-1);
    
    // Buscar chaves de produto hits
    const productHitKeys = await env.PERFORMANCE_METRICS.list({ 
      prefix: 'product_hits:',
      limit: 100
    });
    
    // Mapear por popularidade
    const productHits = [];
    
    for (const key of productHitKeys.keys) {
      // Extrair ID do produto da chave
      const matches = key.name.match(/product_hits:(\d+):/);
      if (!matches) continue;
      
      const productId = matches[1];
      
      // Obter contagem de hits
      const data = await env.PERFORMANCE_METRICS.get(key.name, { type: 'json' });
      if (data && data.count) {
        // Verificar se já temos este produto na lista
        const existing = productHits.find(p => p.id === productId);
        
        if (existing) {
          existing.hits += data.count;
        } else {
          productHits.push({
            id: productId,
            hits: data.count
          });
        }
      }
    }
    
    // Ordenar por hits (mais alto primeiro)
    return productHits.sort((a, b) => b.hits - a.hits);
  } catch (error) {
    console.error('Erro ao obter dados de produtos populares:', error);
    return [];
  }
}

/**
 * Calcula o hit ratio (porcentagem de hits)
 */
function calculateHitRatio(hits, misses) {
  const total = hits + misses;
  if (total === 0) return 0;
  
  return Math.round((hits / total) * 100);
}

/**
 * Retorna uma resposta JSON com os headers adequados
 */
function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  });
}