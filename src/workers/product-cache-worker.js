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
    
    // 4. Endpoint para warm-up de cache
    if (path === '/api/cache/warm-up' && request.method === 'POST') {
      return await handleCacheWarmUp(request, env, ctx);
    }
    
    // 5. Endpoint para invalidação de cache
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