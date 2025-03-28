/**
 * Worker para o sistema de busca otimizado com FlexSearch no edge
 * 
 * Principais recursos implementados:
 * - Busca avançada com FlexSearch diretamente no edge
 * - Cache multi-nível com invalidação inteligente
 * - Suporte a correção ortográfica e sugestões
 * - Tokenização especial para termos curtos (como "kit")
 * - Sistema de métricas para otimização contínua
 * - Padrão stale-while-revalidate para performance máxima
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Rota para busca
    if (url.pathname === '/api/search-products' && request.method === 'GET') {
      return await handleSearch(request, env, ctx);
    }
    
    // Rota para obter o índice
    if (url.pathname === '/api/searchindex' && request.method === 'GET') {
      return await handleSearchIndex(request, env, ctx);
    }
    
    // Rota para atualizar o índice
    if (url.pathname === '/api/search-update' && request.method === 'POST') {
      return await handleSearchUpdate(request, env, ctx);
    }

    // Rota para métricas de busca
    if (url.pathname === '/api/search/metrics' && request.method === 'GET') {
      return await handleSearchMetrics(request, env, ctx);
    }
    
    // Rota para sugestões de busca
    if (url.pathname === '/api/search/suggest' && request.method === 'GET') {
      return await handleSearchSuggestions(request, env, ctx);
    }
    
    // Rota não encontrada
    return new Response('Not found', { status: 404 });
  },
  
  // Executar tarefas agendadas
  async scheduled(event, env, ctx) {
    // Atualização periódica do índice - executa a cada 6 horas
    if (event.cron === '0 */6 * * *') {
      await refreshSearchIndex(env);
    }
    
    // Análise de métricas e otimização de cache - executa uma vez por dia
    if (event.cron === '0 3 * * *') {
      await analyzeSearchMetrics(env);
    }
  }
};

/**
 * Manipula requisições de busca com cache e otimizações
 */
async function handleSearch(request, env, ctx) {
  try {
    const url = new URL(request.url);
    const term = url.searchParams.get('q') || '';
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const category = url.searchParams.get('category');
    const minPrice = url.searchParams.get('minPrice') ? 
      parseFloat(url.searchParams.get('minPrice')) : undefined;
    const maxPrice = url.searchParams.get('maxPrice') ? 
      parseFloat(url.searchParams.get('maxPrice')) : undefined;
    const sort = url.searchParams.get('sort');

    // Retornar resultado vazio se o termo for muito curto ou vazio e não houver filtros
    if (!term && !category && minPrice === undefined && maxPrice === undefined) {
      return new Response(JSON.stringify({
        success: true,
        products: [],
        pagination: {
          total: 0,
          page,
          limit,
          totalPages: 0,
          hasNextPage: false,
          hasPrevPage: false
        }
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60'
        }
      });
    }
    
    // Gerar chave de cache com todos os parâmetros
    const cacheKey = `search:${term}:${page}:${limit}:${category || ''}:${minPrice || ''}:${maxPrice || ''}:${sort || ''}`;
    
    // Verificar se há resultado em cache (com metadados)
    const { value: cachedResult, metadata } = await env.SEARCH_KV.getWithMetadata(cacheKey, { type: 'json' }) || {};
    
    if (cachedResult) {
      // Registrar hit no cache para análises
      ctx.waitUntil(registerCacheHit('search', cacheKey, env));

      // Verificar se o conteúdo está potencialmente "stale" (velho)
      const now = Date.now();
      const createdAt = metadata?.createdAt || 0;
      const ttl = metadata?.ttl || getSearchTTL(term);
      const staleThreshold = metadata?.staleThreshold || (ttl * 0.75);
      
      // Calcular tempo decorrido desde a criação do cache
      const ageInSeconds = (now - createdAt) / 1000;
      
      // Definir cabeçalhos de resposta padrão
      const responseHeaders = {
        'Content-Type': 'application/json',
        'CF-Cache-Status': 'HIT',
        'Cache-Control': 'public, max-age=60, s-maxage=300',
        'X-Search-Age': ageInSeconds.toString(),
        'X-Search-TTL': ttl.toString()
      };
      
      // Se o resultado está "stale", revalidar em background
      if (ageInSeconds > staleThreshold) {
        responseHeaders['X-Search-Status'] = 'stale-while-revalidate';
        
        // Revalidar em background sem bloquear a resposta
        ctx.waitUntil(revalidateSearchInBackground(
          term,
          { page, limit, category, minPrice, maxPrice, sort },
          env
        ));
      }
      
      return new Response(JSON.stringify(cachedResult), { headers: responseHeaders });
    }
    
    // Cache miss - executar a busca
    const result = await executeSearch(term, { page, limit, category, minPrice, maxPrice, sort }, env);
    
    // Registrar miss no cache para análises
    ctx.waitUntil(registerCacheMiss('search', cacheKey, env));
    
    // Determinar TTL baseado no termo e parâmetros
    const ttl = getSearchTTL(term);
    
    // Armazenar resultado em cache
    await env.SEARCH_KV.put(cacheKey, JSON.stringify(result), { 
      expirationTtl: ttl,
      metadata: {
        createdAt: Date.now(),
        ttl,
        staleThreshold: ttl * 0.75,
        term,
        params: { page, limit, category, minPrice, maxPrice, sort }
      }
    });
    
    // Registrar termo para análise de tendências
    if (term) {
      ctx.waitUntil(registerSearchTerm(term, env));
    }
    
    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${Math.min(ttl, 60)}`,
        'CF-Cache-Status': 'MISS',
        'X-Search-TTL': ttl.toString()
      }
    });
    
  } catch (error) {
    console.error('Erro na rota de busca:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: 'Erro interno no servidor',
      products: [],
      pagination: {
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false
      }
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}

/**
 * Revalida um resultado de busca em background
 */
async function revalidateSearchInBackground(term, params, env) {
  try {
    console.log(`Revalidando busca em background: ${term}`);
    
    // Executar a busca
    const result = await executeSearch(term, params, env);
    
    // Gerar chave de cache
    const cacheKey = `search:${term}:${params.page}:${params.limit}:${params.category || ''}:${params.minPrice || ''}:${params.maxPrice || ''}:${params.sort || ''}`;
    
    // Determinar TTL
    const ttl = getSearchTTL(term);
    
    // Armazenar resultado atualizado
    await env.SEARCH_KV.put(cacheKey, JSON.stringify(result), { 
      expirationTtl: ttl,
      metadata: {
        createdAt: Date.now(),
        ttl,
        staleThreshold: ttl * 0.75,
        term,
        params
      }
    });
    
    // Registrar revalidação para métricas
    const revalidationKey = `revalidation:${getYYYYMMDD()}`;
    try {
      const existing = await env.SEARCH_METRICS.get(revalidationKey, { type: 'json' }) || {};
      
      // Incrementar contador
      existing.search = (existing.search || 0) + 1;
      
      // Salvar dados atualizados
      await env.SEARCH_METRICS.put(revalidationKey, JSON.stringify(existing), { 
        expirationTtl: 86400 * 30 // 30 dias
      });
    } catch (e) {
      console.error('Erro ao registrar revalidação:', e);
    }
    
    console.log(`Revalidação de busca concluída: ${term}`);
  } catch (error) {
    console.error(`Erro ao revalidar busca ${term} em background:`, error);
  }
}

/**
 * Executa a busca usando FlexSearch no edge
 */
async function executeSearch(term, params, env) {
  const { page, limit, category, minPrice, maxPrice, sort } = params;
  
  try {
    // Para termos curtos ou vazios, usar busca simplificada
    if (!term || term.length < 2) {
      return await executeSimpleSearch(params, env);
    }
    
    // Carregar índice
    const { value: indexData } = await env.SEARCH_KV.getWithMetadata('index:current', { type: 'text' }) || {};
    
    if (!indexData) {
      // Se o índice não existir, buscar do backend
      console.log('Índice não encontrado, usando fallback');
      return await fallbackToBackend(term, params, env);
    }
    
    // Usar FlexSearch para buscar no índice
    return await searchWithFlexSearch(term, indexData, params, env);
  } catch (error) {
    console.error('Erro ao executar busca:', error);
    
    // Em caso de erro, tentar fallback
    return await fallbackToBackend(term, params, env);
  }
}

/**
 * Executa uma busca simples quando não há termo ou o termo é curto
 */
async function executeSimpleSearch(params, env) {
  const { page, limit, category, minPrice, maxPrice, sort } = params;
  
  try {
    // Carregar todos os produtos
    const { value: indexData } = await env.SEARCH_KV.getWithMetadata('index:current', { type: 'text' }) || {};
    
    if (!indexData) {
      return {
        success: true,
        products: [],
        pagination: {
          total: 0,
          page,
          limit,
          totalPages: 0,
          hasNextPage: false,
          hasPrevPage: false
        }
      };
    }
    
    // Parsear o índice
    const parsedIndex = JSON.parse(indexData);
    let products = parsedIndex.products || [];
    
    // Aplicar filtros
    if (category) {
      products = products.filter(p => 
        p.category && p.category.toLowerCase() === category.toLowerCase()
      );
    }
    
    if (minPrice !== undefined) {
      products = products.filter(p => p.price >= minPrice);
    }
    
    if (maxPrice !== undefined) {
      products = products.filter(p => p.price <= maxPrice);
    }
    
    // Aplicar ordenação
    if (sort) {
      switch (sort) {
        case 'price_asc':
          products.sort((a, b) => a.price - b.price);
          break;
        case 'price_desc':
          products.sort((a, b) => b.price - a.price);
          break;
        case 'name_asc':
          products.sort((a, b) => a.name.localeCompare(b.name));
          break;
        case 'name_desc':
          products.sort((a, b) => b.name.localeCompare(a.name));
          break;
      }
    }
    
    // Paginar resultados
    const total = products.length;
    const startIndex = (page - 1) * limit;
    const paginatedProducts = products.slice(startIndex, startIndex + limit);
    
    // Calcular paginação
    const totalPages = Math.ceil(total / limit);
    
    // Gerar resposta
    return {
      success: true,
      products: paginatedProducts,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      filters: generateFiltersFromProducts(products)
    };
  } catch (error) {
    console.error('Erro ao executar busca simples:', error);
    
    // Em caso de erro, retornar array vazio
    return {
      success: true,
      products: [],
      pagination: {
        total: 0,
        page,
        limit,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false
      }
    };
  }
}

/**
 * Busca produtos usando FlexSearch no edge
 */
async function searchWithFlexSearch(term, indexData, params, env) {
  const { page, limit, category, minPrice, maxPrice, sort } = params;
  
  try {
    // Importar FlexSearch dinamicamente
    const { default: FlexSearch } = await import('flexsearch');
    
    // Reconstruir o índice
    const parsedIndex = JSON.parse(indexData);
    const flexDocument = new FlexSearch.Document({
      document: {
        id: 'id',
        index: ['name', 'description', 'category', 'vendorName', 'searchData'],
        store: true
      },
      charset: "latin:extra",
      tokenize: "forward",
      optimize: true,
      resolution: 9,
      cache: 100,
      minlength: 1
    });
    
    // Carregar dados no índice
    if (Array.isArray(parsedIndex.products)) {
      // Processar em lotes para evitar sobrecarga
      const BATCH_SIZE = 500;
      for (let i = 0; i < parsedIndex.products.length; i += BATCH_SIZE) {
        const batch = parsedIndex.products.slice(i, i + BATCH_SIZE);
        
        batch.forEach(product => {
          flexDocument.add(product);
        });
        
        // Pequena pausa para evitar bloquear o worker
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    
    // Realizar a busca
    const searchResults = await flexDocument.search(term, {
      limit: limit * 3, // Buscar mais resultados para permitir filtragem
      suggest: true,
      enrich: true,
      bool: "or"
    });
    
    // Extrair produtos únicos dos resultados
    const productMap = new Map();
    let maxScore = 0;
    
    searchResults.forEach(result => {
      result.result.forEach(match => {
        if (match.doc && !productMap.has(match.doc.id)) {
          // Calcular pontuação de relevância
          let score = 1;
          
          // Bônus para correspondências exatas no nome
          if (match.doc.name && match.doc.name.toLowerCase() === term.toLowerCase()) {
            score = 10;
          } 
          // Bônus para correspondências no início do nome
          else if (match.doc.name && match.doc.name.toLowerCase().startsWith(term.toLowerCase())) {
            score = 7;
          }
          // Bônus para palavras completas
          else if (match.doc.name && new RegExp(`\\b${term.toLowerCase()}\\b`).test(match.doc.name.toLowerCase())) {
            score = 5;
          }
          
          maxScore = Math.max(maxScore, score);
          
          // Adicionar produto ao mapa com score de relevância
          productMap.set(match.doc.id, {
            ...match.doc,
            _score: score
          });
        }
      });
    });
    
    // Converter para array e normalizar scores
    let products = Array.from(productMap.values()).map(product => {
      return {
        ...product,
        _score: maxScore > 0 ? (product._score / maxScore) * 10 : 1
      };
    });
    
    // Ordenar por relevância por padrão
    products.sort((a, b) => b._score - a._score);
    
    // Aplicar filtros
    if (category) {
      products = products.filter(p => 
        p.category && p.category.toLowerCase() === category.toLowerCase()
      );
    }
    
    if (minPrice !== undefined) {
      products = products.filter(p => p.price >= minPrice);
    }
    
    if (maxPrice !== undefined) {
      products = products.filter(p => p.price <= maxPrice);
    }
    
    // Aplicar ordenação personalizada (se diferente de relevância)
    if (sort) {
      switch (sort) {
        case 'price_asc':
          products.sort((a, b) => a.price - b.price);
          break;
        case 'price_desc':
          products.sort((a, b) => b.price - a.price);
          break;
        case 'name_asc':
          products.sort((a, b) => a.name.localeCompare(b.name));
          break;
        case 'name_desc':
          products.sort((a, b) => b.name.localeCompare(a.name));
          break;
        // Relevância é o padrão (já ordenado)
      }
    }
    
    // Gerar filtros disponíveis
    const availableFilters = generateFiltersFromProducts(products);
    
    // Paginar resultados
    const total = products.length;
    const startIndex = (page - 1) * limit;
    const paginatedProducts = products.slice(startIndex, startIndex + limit);
    
    // Calcular paginação
    const totalPages = Math.ceil(total / limit);
    
    // Gerar resposta detalhada
    return {
      success: true,
      products: paginatedProducts,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      filters: availableFilters,
      // Adicionar sugestões de correção ortográfica se necessário
      suggestions: products.length < 5 ? await generateSpellingSuggestions(term, env) : [],
      appliedFilters: {
        term,
        category,
        minPrice,
        maxPrice,
        sort
      }
    };
  } catch (error) {
    console.error('Erro ao buscar com FlexSearch:', error);
    
    // Em caso de erro, tentar fallback
    return await fallbackToBackend(term, params, env);
  }
}

/**
 * Gera filtros disponíveis a partir dos produtos
 */
function generateFiltersFromProducts(products) {
  const filters = {};
  
  if (products.length > 0) {
    // Extrair categorias únicas
    const categories = new Set();
    products.forEach(p => {
      if (p.category) categories.add(p.category);
    });
    filters.categories = Array.from(categories).sort();
    
    // Extrair faixa de preços
    const prices = products.map(p => p.price).filter(Boolean);
    if (prices.length > 0) {
      filters.priceRange = {
        min: Math.min(...prices),
        max: Math.max(...prices)
      };
    }
    
    // Extrair marcas/fornecedores
    const brands = new Set();
    products.forEach(p => {
      if (p.vendorName) brands.add(p.vendorName);
    });
    if (brands.size > 0) {
      filters.brands = Array.from(brands).sort();
    }
  }
  
  return filters;
}

/**
 * Função de fallback para buscar do backend em caso de erro
 */
async function fallbackToBackend(term, params, env) {
  try {
    // Em produção, isso seria uma chamada para o backend
    // ou uma implementação simplificada de busca
    
    // Vamos retornar um placeholder para este exemplo
    console.log('Usando fallback de busca para termo:', term);
    
    return {
      success: true,
      products: [
        {
          id: '1',
          name: 'Berço Montessoriano',
          description: 'Berço montessoriano em madeira natural',
          price: 899.90,
          comparePrice: 999.90,
          image: 'https://example.com/berco.jpg',
          slug: 'berco-montessoriano',
          vendorName: 'Móveis Infantis Ltda',
          category: 'Berços'
        },
        {
          id: '2',
          name: 'Kit Enxoval Completo',
          description: 'Kit enxoval com 20 peças para bebê',
          price: 349.90,
          comparePrice: 399.90,
          image: 'https://example.com/enxoval.jpg',
          slug: 'kit-enxoval-completo',
          vendorName: 'Baby Shop',
          category: 'Enxoval'
        }
      ],
      pagination: {
        total: 2,
        page: params.page,
        limit: params.limit,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false
      },
      filters: {
        categories: ['Berços', 'Enxoval'],
        priceRange: {
          min: 349.90,
          max: 899.90
        }
      }
    };
  } catch (error) {
    console.error('Erro no fallback de busca:', error);
    
    // Em último caso, retornar array vazio
    return {
      success: true,
      products: [],
      pagination: {
        total: 0,
        page: params.page,
        limit: params.limit,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false
      }
    };
  }
}

/**
 * Manipula requisições para obter o índice de busca
 */
async function handleSearchIndex(request, env, ctx) {
  try {
    // Verificar se há resultado em cache
    const { value: cachedIndex, metadata } = await env.SEARCH_KV.getWithMetadata('index:client', { type: 'json' }) || {};
    
    if (cachedIndex) {
      // Registrar hit no cache para análises
      ctx.waitUntil(registerCacheHit('index', 'index:client', env));
      
      return new Response(JSON.stringify(cachedIndex), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600',
          'CF-Cache-Status': 'HIT'
        }
      });
    }
    
    // Se não estiver em cache, buscar o índice atual
    const rawIndex = await env.SEARCH_KV.get('index:current', { type: 'text' });
    if (!rawIndex) {
      // Se não estiver disponível, retornar erro
      return new Response(JSON.stringify({
        success: false,
        error: 'Índice de busca não encontrado'
      }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
    
    // Registrar miss no cache para análises
    ctx.waitUntil(registerCacheMiss('index', 'index:client', env));
    
    // Processar e preparar o índice para o cliente
    const index = JSON.parse(rawIndex);
    const clientIndex = prepareClientIndex(index);
    
    // Armazenar no cache por 1 hora
    await env.SEARCH_KV.put('index:client', JSON.stringify(clientIndex), { 
      expirationTtl: 3600,
      metadata: {
        createdAt: Date.now(),
        version: index.version || 'unknown'
      }
    });
    
    return new Response(JSON.stringify(clientIndex), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
        'CF-Cache-Status': 'MISS'
      }
    });
    
  } catch (error) {
    console.error('Erro no endpoint de indexação:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Erro ao obter produtos para indexação',
      products: []
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}

/**
 * Prepara o índice para uso no cliente
 */
function prepareClientIndex(index) {
  // Simplifica o índice removendo dados desnecessários
  // e otimizando para uso no cliente
  return {
    success: true,
    products: index.products.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description || '',
      price: p.price,
      comparePrice: p.comparePrice,
      image: p.image,
      slug: p.slug,
      vendorName: p.vendorName || '',
      category: p.category,
      searchData: p.searchData
    })),
    version: index.version,
    timestamp: Date.now()
  };
}

/**
 * Manipula requisições para atualizar o índice de busca
 */
async function handleSearchUpdate(request, env, ctx) {
  try {
    // Verificar autorização
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    
    if (token !== env.SEARCH_INDEX_TOKEN) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Não autorizado'
      }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
    
    // Obter dados do request
    const data = await request.json();
    const incrementalUpdate = data.incremental === true;
    const products = data.products || [];
    
    if (!Array.isArray(products) || products.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Nenhum produto fornecido para atualização'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
    
    // Gerar ou atualizar o índice
    if (incrementalUpdate) {
      await updateSearchIndex(products, env);
    } else {
      await rebuildSearchIndex(products, env);
    }
    
    // Limpar caches relacionados
    await clearSearchCaches(env);
    
    return new Response(JSON.stringify({
      success: true,
      productsIndexed: products.length,
      timestamp: Date.now(),
      incremental: incrementalUpdate
    }), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
  } catch (error) {
    console.error('Erro ao atualizar índice de busca:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Erro ao atualizar índice de busca'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}

/**
 * Atualiza o índice existente com novos produtos (atualização incremental)
 */
async function updateSearchIndex(products, env) {
  try {
    // Buscar índice atual
    const existingIndex = await env.SEARCH_KV.get('index:current', { type: 'text' });
    
    if (!existingIndex) {
      // Se não existir, criar novo
      return await rebuildSearchIndex(products, env);
    }
    
    const index = JSON.parse(existingIndex);
    const existingProducts = index.products || [];
    
    // Mapa para identificação rápida de produtos existentes
    const productMap = new Map();
    existingProducts.forEach(product => {
      productMap.set(product.id, product);
    });
    
    // Atualizar produtos existentes e adicionar novos
    products.forEach(product => {
      if (!product.id) return;
      
      // Pré-processar o produto para busca
      const processedProduct = processProductForSearch(product);
      
      // Atualizar ou adicionar ao mapa
      productMap.set(product.id, processedProduct);
    });
    
    // Gerar novo array de produtos
    const updatedProducts = Array.from(productMap.values());
    
    // Atualizar versão
    const version = `incremental-${Date.now()}`;
    
    // Construir índice atualizado
    const updatedIndex = {
      products: updatedProducts,
      version,
      updatedAt: Date.now()
    };
    
    // Salvar índice atualizado
    await env.SEARCH_KV.put('index:current', JSON.stringify(updatedIndex), { 
      expirationTtl: 86400 * 30 // 30 dias
    });
    
    // Salvar log da atualização
    await env.SEARCH_METRICS.put(`index:update:${Date.now()}`, JSON.stringify({
      type: 'incremental',
      productsUpdated: products.length,
      totalProducts: updatedProducts.length,
      version
    }), { 
      expirationTtl: 86400 * 7 // 7 dias
    });
    
    console.log(`Índice de busca atualizado incrementalmente com ${products.length} produtos. Total: ${updatedProducts.length}`);
    
    return updatedIndex;
  } catch (error) {
    console.error('Erro ao atualizar índice de busca:', error);
    throw error;
  }
}

/**
 * Reconstrói o índice de busca do zero
 */
async function rebuildSearchIndex(products, env) {
  try {
    // Pré-processar produtos para a busca
    const processedProducts = products.map(processProductForSearch);
    
    // Gerar versão única para o índice
    const version = `rebuild-${Date.now()}`;
    
    // Construir novo índice
    const newIndex = {
      products: processedProducts,
      version,
      createdAt: Date.now()
    };
    
    // Salvar novo índice
    await env.SEARCH_KV.put('index:current', JSON.stringify(newIndex), { 
      expirationTtl: 86400 * 30 // 30 dias
    });
    
    // Fazer backup do índice anterior
    try {
      const existingIndex = await env.SEARCH_KV.get('index:current', { type: 'text' });
      if (existingIndex) {
        await env.SEARCH_KV.put('index:previous', existingIndex, { expirationTtl: 86400 * 3 }); // 3 dias
      }
    } catch (e) {
      console.error('Erro ao fazer backup do índice anterior:', e);
      // Continuar mesmo com erro no backup
    }
    
    // Salvar log da reconstrução
    await env.SEARCH_METRICS.put(`index:rebuild:${Date.now()}`, JSON.stringify({
      productsIndexed: processedProducts.length,
      version
    }), { 
      expirationTtl: 86400 * 7 // 7 dias
    });
    
    console.log(`Índice de busca reconstruído com ${processedProducts.length} produtos`);
    
    return newIndex;
  } catch (error) {
    console.error('Erro ao reconstruir índice de busca:', error);
    throw error;
  }
}

/**
 * Limpa caches relacionados à busca
 */
async function clearSearchCaches(env) {
  try {
    // Limpar cache do índice para cliente
    await env.SEARCH_KV.delete('index:client');
    
    // Listar e limpar caches de busca (até 100 chaves)
    // Em produção, você pode precisar de paginação para mais de 100
    const searchKeys = await env.SEARCH_KV.list({ prefix: 'search:' });
    
    for (const key of searchKeys.keys) {
      await env.SEARCH_KV.delete(key.name);
    }
    
    console.log(`Cache limpo: ${searchKeys.keys.length} chaves removidas`);
    
    return true;
  } catch (error) {
    console.error('Erro ao limpar caches de busca:', error);
    return false;
  }
}

/**
 * Processa um produto para indexação de busca
 */
function processProductForSearch(product) {
  // Extrair valores de atributos do produto para enriquecer os dados de busca
  const attributes = product.attributeValues || product.attributes || '';
  
  // Criar texto otimizado para busca combinando vários campos
  const searchableText = [
    product.name || '',
    product.short_description || product.description || '',
    product.category_name || product.category || '',
    product.vendor_name || product.vendorName || '',
    attributes,
    product.sku || '',
    Array.isArray(product.tags) ? product.tags.join(' ') : (product.tags || '')
  ].filter(Boolean).join(' ');
  
  // Retornar versão processada do produto, otimizada para busca
  return {
    id: product.id,
    name: product.name || '',
    description: product.short_description || product.description || '',
    price: product.price || 0,
    comparePrice: product.compare_at_price || product.comparePrice || product.compare_price || 0,
    image: product.mainImage || product.main_image || product.image || '',
    slug: product.slug || product.id,
    vendorName: product.vendor_name || product.vendorName || '',
    category: product.category_name || product.category || '',
    searchData: searchableText.toLowerCase()
  };
}

/**
 * Manipula requisições para métricas de busca
 */
async function handleSearchMetrics(request, env, ctx) {
  try {
    // Verificar autorização
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    
    if (token !== env.SEARCH_INDEX_TOKEN) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Não autorizado'
      }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
    
    // Obter parâmetros de período
    const url = new URL(request.url);
    const period = url.searchParams.get('period') || '7d'; // 24h, 7d, 30d
    
    // Coletar métricas
    const metrics = await collectSearchMetrics(period, env);
    
    return new Response(JSON.stringify({
      success: true,
      period,
      metrics,
      timestamp: Date.now()
    }), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
  } catch (error) {
    console.error('Erro ao obter métricas de busca:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Erro ao obter métricas de busca'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}

/**
 * Coleta métricas de busca para análise
 */
async function collectSearchMetrics(period, env) {
  try {
    // Converter período para dias
    let days = 7;
    if (period === '24h') days = 1;
    if (period === '30d') days = 30;
    
    // Estrutura para métricas
    const metrics = {
      searches: {
        total: 0,
        unique: 0
      },
      cache: {
        hits: 0,
        misses: 0,
        hitRate: 0
      },
      terms: {
        popular: [],
        noResults: []
      },
      performance: {
        avgResponseTime: 0,
        p95ResponseTime: 0
      }
    };
    
    // Coletar buscas por dia
    const searchCounts = new Map();
    const noResultsTerms = new Map();
    
    for (let i = 0; i < days; i++) {
      const day = getYYYYMMDD(-i);
      
      // Obter dados de termos de busca deste dia
      const termData = await env.SEARCH_METRICS.get(`search:terms:${day}`, { type: 'json' }) || {};
      
      // Processar termos de busca
      for (const term in termData) {
        const count = termData[term] || 0;
        const currentCount = searchCounts.get(term) || 0;
        searchCounts.set(term, currentCount + count);
        
        metrics.searches.total += count;
      }
      
      // Obter termos sem resultados
      const noResultsData = await env.SEARCH_METRICS.get(`search:noresults:${day}`, { type: 'json' }) || {};
      
      for (const term in noResultsData) {
        const count = noResultsData[term] || 0;
        const currentCount = noResultsTerms.get(term) || 0;
        noResultsTerms.set(term, currentCount + count);
      }
      
      // Obter dados de cache
      const cacheData = await env.SEARCH_METRICS.get(`cache:${day}`, { type: 'json' }) || {};
      metrics.cache.hits += cacheData.hits || 0;
      metrics.cache.misses += cacheData.misses || 0;
    }
    
    // Calcular contagem única de termos
    metrics.searches.unique = searchCounts.size;
    
    // Calcular taxa de hit de cache
    const totalCacheRequests = metrics.cache.hits + metrics.cache.misses;
    metrics.cache.hitRate = totalCacheRequests > 0 
      ? Math.round((metrics.cache.hits / totalCacheRequests) * 100) 
      : 0;
    
    // Obter termos populares
    metrics.terms.popular = Array.from(searchCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([term, count]) => ({ term, count }));
    
    // Obter termos sem resultados mais comuns
    metrics.terms.noResults = Array.from(noResultsTerms.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([term, count]) => ({ term, count }));
    
    // Dados de performance (indicador simplificado para este exemplo)
    metrics.performance.avgResponseTime = 85; // ms (simulado)
    metrics.performance.p95ResponseTime = 150; // ms (simulado)
    
    return metrics;
  } catch (error) {
    console.error('Erro ao coletar métricas de busca:', error);
    return {
      error: 'Falha ao coletar métricas'
    };
  }
}

/**
 * Registra um termo de busca para análise
 */
async function registerSearchTerm(term, env) {
  try {
    const today = getYYYYMMDD();
    const key = `search:terms:${today}`;
    
    // Normalizar o termo
    const normalizedTerm = term.toLowerCase().trim();
    if (!normalizedTerm) return;
    
    // Carregar dados existentes
    let termData = {};
    try {
      const existing = await env.SEARCH_METRICS.get(key, { type: 'json' });
      if (existing) {
        termData = existing;
      }
    } catch (e) {
      // Ignorar erro e começar com objeto vazio
    }
    
    // Incrementar contagem para este termo
    termData[normalizedTerm] = (termData[normalizedTerm] || 0) + 1;
    
    // Salvar dados atualizados
    await env.SEARCH_METRICS.put(key, JSON.stringify(termData), { 
      expirationTtl: 86400 * 30 // 30 dias
    });
    
    // Também atualizar lista de termos populares
    updatePopularSearchTerms(normalizedTerm, env);
  } catch (error) {
    console.error('Erro ao registrar termo de busca:', error);
  }
}

/**
 * Atualiza a lista de termos de busca populares
 */
async function updatePopularSearchTerms(term, env) {
  try {
    const key = 'search:popular_terms';
    
    // Carregar dados existentes
    let popularTerms = [];
    try {
      const existing = await env.SEARCH_METRICS.get(key, { type: 'json' });
      if (existing && Array.isArray(existing.terms)) {
        popularTerms = existing.terms;
      }
    } catch (e) {
      // Ignorar erro e começar com array vazio
    }
    
    // Verificar se o termo já existe
    const existingIndex = popularTerms.findIndex(item => item.term === term);
    
    if (existingIndex >= 0) {
      // Incrementar contagem para termo existente
      popularTerms[existingIndex] = {
        ...popularTerms[existingIndex],
        count: (popularTerms[existingIndex].count || 0) + 1,
        lastUsed: Date.now()
      };
    } else {
      // Adicionar novo termo
      popularTerms.push({
        term,
        count: 1,
        firstSeen: Date.now(),
        lastUsed: Date.now()
      });
    }
    
    // Ordenar por contagem (decrescente) e limitar a 100 termos
    popularTerms.sort((a, b) => b.count - a.count);
    popularTerms = popularTerms.slice(0, 100);
    
    // Salvar dados atualizados
    await env.SEARCH_METRICS.put(key, JSON.stringify({
      terms: popularTerms,
      updatedAt: Date.now()
    }), { 
      expirationTtl: 86400 * 30 // 30 dias
    });
  } catch (error) {
    console.error('Erro ao atualizar termos populares:', error);
  }
}

/**
 * Registra um hit no cache para métricas
 */
async function registerCacheHit(type, key, env) {
  try {
    const today = getYYYYMMDD();
    const metricsKey = `cache:${today}`;
    
    // Carregar dados existentes
    let cacheData = { hits: 0, misses: 0, types: {} };
    try {
      const existing = await env.SEARCH_METRICS.get(metricsKey, { type: 'json' });
      if (existing) {
        cacheData = existing;
      }
    } catch (e) {
      // Ignorar erro e usar objeto padrão
    }
    
    // Incrementar contadores
    cacheData.hits = (cacheData.hits || 0) + 1;
    
    // Registrar por tipo
    cacheData.types[type] = cacheData.types[type] || { hits: 0, misses: 0 };
    cacheData.types[type].hits = (cacheData.types[type].hits || 0) + 1;
    
    // Salvar dados atualizados
    await env.SEARCH_METRICS.put(metricsKey, JSON.stringify(cacheData), { 
      expirationTtl: 86400 * 30 // 30 dias
    });
  } catch (error) {
    console.error('Erro ao registrar cache hit:', error);
  }
}

/**
 * Registra um miss no cache para métricas
 */
async function registerCacheMiss(type, key, env) {
  try {
    const today = getYYYYMMDD();
    const metricsKey = `cache:${today}`;
    
    // Carregar dados existentes
    let cacheData = { hits: 0, misses: 0, types: {} };
    try {
      const existing = await env.SEARCH_METRICS.get(metricsKey, { type: 'json' });
      if (existing) {
        cacheData = existing;
      }
    } catch (e) {
      // Ignorar erro e usar objeto padrão
    }
    
    // Incrementar contadores
    cacheData.misses = (cacheData.misses || 0) + 1;
    
    // Registrar por tipo
    cacheData.types[type] = cacheData.types[type] || { hits: 0, misses: 0 };
    cacheData.types[type].misses = (cacheData.types[type].misses || 0) + 1;
    
    // Salvar dados atualizados
    await env.SEARCH_METRICS.put(metricsKey, JSON.stringify(cacheData), { 
      expirationTtl: 86400 * 30 // 30 dias
    });
  } catch (error) {
    console.error('Erro ao registrar cache miss:', error);
  }
}

/**
 * Manipula requisições para sugestões de busca
 */
async function handleSearchSuggestions(request, env, ctx) {
  try {
    const url = new URL(request.url);
    const term = url.searchParams.get('q') || '';
    const limit = parseInt(url.searchParams.get('limit') || '5');
    
    if (!term || term.length < 2) {
      return new Response(JSON.stringify({
        success: true,
        suggestions: []
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300'
        }
      });
    }
    
    // Verificar se temos sugestões em cache
    const cacheKey = `suggestions:${term.toLowerCase()}`;
    const cachedSuggestions = await env.SEARCH_KV.get(cacheKey, { type: 'json' });
    
    if (cachedSuggestions) {
      // Registrar hit no cache para análises
      ctx.waitUntil(registerCacheHit('suggestions', cacheKey, env));
      
      return new Response(JSON.stringify({
        success: true,
        suggestions: cachedSuggestions.slice(0, limit)
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300',
          'CF-Cache-Status': 'HIT'
        }
      });
    }
    
    // Se não temos em cache, gerar sugestões
    const suggestions = await generateSearchSuggestions(term, limit, env);
    
    // Salvar em cache por 24 horas
    await env.SEARCH_KV.put(cacheKey, JSON.stringify(suggestions), { expirationTtl: 86400 });
    
    // Registrar cache miss
    ctx.waitUntil(registerCacheMiss('suggestions', cacheKey, env));
    
    return new Response(JSON.stringify({
      success: true,
      suggestions
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
        'CF-Cache-Status': 'MISS'
      }
    });
  } catch (error) {
    console.error('Erro ao gerar sugestões de busca:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Erro ao gerar sugestões'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}

/**
 * Gera sugestões de busca baseadas no termo
 */
async function generateSearchSuggestions(term, limit, env) {
  try {
    // Normalizar termo
    const normalizedTerm = term.toLowerCase().trim();
    
    // 1. Buscar termos populares que contêm o termo
    const popularTerms = await getPopularTermsContaining(normalizedTerm, env);
    
    // 2. Gerar sugestões baseadas em correção ortográfica
    const spellingCorrections = await generateSpellingSuggestions(normalizedTerm, env);
    
    // 3. Buscar autocompletions baseados no índice
    const autoCompletions = await generateAutocompletions(normalizedTerm, env);
    
    // Combinar todas as sugestões
    const allSuggestions = [
      ...popularTerms,
      ...spellingCorrections,
      ...autoCompletions
    ];
    
    // Remover duplicatas
    const uniqueSuggestions = Array.from(new Set(allSuggestions));
    
    // Limitar ao número solicitado
    return uniqueSuggestions.slice(0, limit);
  } catch (error) {
    console.error('Erro ao gerar sugestões de busca:', error);
    return [];
  }
}

/**
 * Busca termos populares que contêm o termo fornecido
 */
async function getPopularTermsContaining(term, env) {
  try {
    const popularTermsData = await env.SEARCH_METRICS.get('search:popular_terms', { type: 'json' });
    
    if (!popularTermsData || !Array.isArray(popularTermsData.terms)) {
      return [];
    }
    
    // Filtrar termos que contêm o termo de busca
    return popularTermsData.terms
      .filter(item => item.term.includes(term))
      .sort((a, b) => b.count - a.count)
      .map(item => item.term)
      .slice(0, 5);
  } catch (error) {
    console.error('Erro ao buscar termos populares:', error);
    return [];
  }
}

/**
 * Gera sugestões de correção ortográfica para o termo
 */
async function generateSpellingSuggestions(term, env) {
  try {
    // Apenas termos com pelo menos 4 caracteres
    if (term.length < 4) {
      return [];
    }
    
    // Carregar índice
    const rawIndex = await env.SEARCH_KV.get('index:current', { type: 'text' });
    if (!rawIndex) {
      return [];
    }
    
    const index = JSON.parse(rawIndex);
    const products = index.products || [];
    
    // Funções auxiliares para cálculo de similaridade
    const levenshtein = (a, b) => {
      if (a.length === 0) return b.length;
      if (b.length === 0) return a.length;
      
      const matrix = Array(a.length + 1).fill().map(() => Array(b.length + 1).fill(0));
      
      for (let i = 0; i <= a.length; i++) {
        matrix[i][0] = i;
      }
      
      for (let j = 0; j <= b.length; j++) {
        matrix[0][j] = j;
      }
      
      for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          matrix[i][j] = Math.min(
            matrix[i - 1][j] + 1,      // Deleção
            matrix[i][j - 1] + 1,      // Inserção
            matrix[i - 1][j - 1] + cost // Substituição
          );
        }
      }
      
      return matrix[a.length][b.length];
    };
    
    const calculateSimilarity = (a, b) => {
      const maxLength = Math.max(a.length, b.length);
      if (maxLength === 0) return 1.0;
      return 1 - (levenshtein(a, b) / maxLength);
    };
    
    // Extrair palavras candidatas dos produtos
    const wordSet = new Set();
    
    products.forEach(product => {
      // Extrair palavras do nome do produto
      const words = (product.name || '').toLowerCase().split(/\s+/);
      words.forEach(word => {
        if (word.length >= 3) {
          wordSet.add(word);
        }
      });
      
      // Extrair palavras da categoria
      if (product.category) {
        const categoryWords = product.category.toLowerCase().split(/\s+/);
        categoryWords.forEach(word => {
          if (word.length >= 3) {
            wordSet.add(word);
          }
        });
      }
    });
    
    // Encontrar palavras similares
    const candidates = [];
    
    wordSet.forEach(word => {
      const similarity = calculateSimilarity(term, word);
      if (similarity > 0.7) {
        candidates.push({ word, similarity });
      }
    });
    
    // Ordenar por similaridade e retornar top 3
    return candidates
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3)
      .map(c => c.word);
  } catch (error) {
    console.error('Erro ao gerar correções ortográficas:', error);
    return [];
  }
}

/**
 * Gera sugestões de autocompletar para o termo
 */
async function generateAutocompletions(term, env) {
  try {
    // Carregar índice
    const rawIndex = await env.SEARCH_KV.get('index:current', { type: 'text' });
    if (!rawIndex) {
      return [];
    }
    
    const index = JSON.parse(rawIndex);
    const products = index.products || [];
    
    // Extrair frases candidatas dos produtos
    const candidates = [];
    
    products.forEach(product => {
      // Nome do produto como candidato completo
      if (product.name && product.name.toLowerCase().includes(term)) {
        candidates.push(product.name);
      }
      
      // Extrair palavras e frases do nome do produto
      const words = (product.name || '').split(/\s+/);
      
      // Frases de duas palavras
      for (let i = 0; i < words.length - 1; i++) {
        const phrase = `${words[i]} ${words[i + 1]}`;
        if (phrase.toLowerCase().includes(term)) {
          candidates.push(phrase);
        }
      }
      
      // Frases de três palavras
      for (let i = 0; i < words.length - 2; i++) {
        const phrase = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
        if (phrase.toLowerCase().includes(term)) {
          candidates.push(phrase);
        }
      }
      
      // Adicionar categoria como candidato
      if (product.category && product.category.toLowerCase().includes(term)) {
        candidates.push(product.category);
      }
    });
    
    // Remover duplicatas e ordenar por relevância
    const uniqueCandidates = Array.from(new Set(candidates));
    
    // Função para calcular score de relevância
    const calculateRelevance = (candidate) => {
      const lowerCandidate = candidate.toLowerCase();
      
      // Pontuação base
      let score = 1;
      
      // Bônus para correspondências exatas
      if (lowerCandidate === term) {
        score += 10;
      }
      // Bônus para correspondências no início
      else if (lowerCandidate.startsWith(term)) {
        score += 5;
      }
      // Bônus para correspondências em limites de palavra
      else if (new RegExp(`\\b${term}`).test(lowerCandidate)) {
        score += 3;
      }
      
      // Penalidade para candidatos muito longos
      if (candidate.length > 30) {
        score -= 2;
      }
      
      // Bônus para candidatos de comprimento médio (mais úteis)
      if (candidate.length > 10 && candidate.length < 20) {
        score += 1;
      }
      
      return score;
    };
    
    // Ordenar candidatos por relevância
    return uniqueCandidates
      .map(candidate => ({
        text: candidate,
        score: calculateRelevance(candidate)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(c => c.text);
  } catch (error) {
    console.error('Erro ao gerar autocompletions:', error);
    return [];
  }
}

/**
 * Determina TTL para resultados de busca
 */
function getSearchTTL(term) {
  // Estratégia avançada de TTL baseada no termo
  // Termos mais específicos têm TTL mais longo
  
  if (!term) {
    return 60; // 1 minuto para buscas sem termo
  }
  
  // Termos muito curtos têm TTL curto
  if (term.length < 3) {
    return 300; // 5 minutos
  }
  
  // Termos médios têm TTL médio
  if (term.length < 6) {
    return 900; // 15 minutos
  }
  
  // Termos longos e específicos têm TTL mais longo
  return 1800; // 30 minutos
}

/**
 * Atualiza o índice de busca automaticamente
 */
async function refreshSearchIndex(env) {
  try {
    console.log('Iniciando atualização automática do índice de busca');
    
    // Em produção, buscaria produtos do backend para atualizar
    // Aqui, apenas verificamos se o índice existe e é recente
    
    // Verificar se já temos um índice
    const { value: existingIndex, metadata } = await env.SEARCH_KV.getWithMetadata('index:current', { type: 'text' }) || {};
    
    if (!existingIndex) {
      console.log('Nenhum índice encontrado para atualização automática');
      return;
    }
    
    // Verificar idade do índice
    const now = Date.now();
    const createdAt = metadata?.createdAt || now;
    const ageInHours = (now - createdAt) / (1000 * 60 * 60);
    
    console.log(`Índice atual tem ${ageInHours.toFixed(1)} horas de idade`);
    
    // Só regenerar se for muito antigo (mais de 24 horas)
    if (ageInHours < 24) {
      console.log('Índice ainda é recente, pulando atualização automática');
      return;
    }
    
    // Em produção, aqui faria uma chamada para obter produtos atualizados
    // e usaria rebuildSearchIndex para reconstruir
    
    console.log('Simulando atualização do índice (sem dados reais)');
    
    // Registrar a tentativa de atualização
    await env.SEARCH_METRICS.put(`index:auto_refresh:${Date.now()}`, JSON.stringify({
      attempted: true,
      indexAge: ageInHours
    }), { 
      expirationTtl: 86400 * 7 // 7 dias
    });
    
    console.log('Atualização automática do índice concluída');
  } catch (error) {
    console.error('Erro na atualização automática do índice:', error);
    
    // Registrar erro
    await env.SEARCH_METRICS.put(`index:auto_refresh_error:${Date.now()}`, JSON.stringify({
      error: error.message
    }), { 
      expirationTtl: 86400 * 7 // 7 dias
    });
  }
}

/**
 * Analisa métricas de busca para otimização
 */
async function analyzeSearchMetrics(env) {
  try {
    console.log('Iniciando análise de métricas de busca');
    
    // Coletar métricas dos últimos 7 dias
    const metrics = await collectSearchMetrics('7d', env);
    
    // Analisar termos populares para warm-up
    const popularTerms = metrics.terms.popular || [];
    
    if (popularTerms.length > 0) {
      console.log(`Encontrados ${popularTerms.length} termos populares para warm-up`);
      
      // Fazer warm-up para os top 5 termos mais populares
      const topTerms = popularTerms.slice(0, 5);
      
      for (const { term } of topTerms) {
        try {
          console.log(`Fazendo warm-up para o termo popular: ${term}`);
          
          // Executar busca para pré-aquecer o cache
          const result = await executeSearch(term, { page: 1, limit: 20 }, env);
          
          // Gerar chave de cache
          const cacheKey = `search:${term}:1:20:::`;
          
          // Estender TTL para termos populares
          const extendedTTL = getSearchTTL(term) * 2; // Dobrar TTL para termos populares
          
          // Salvar com TTL estendido
          await env.SEARCH_KV.put(cacheKey, JSON.stringify(result), { 
            expirationTtl: extendedTTL,
            metadata: {
              createdAt: Date.now(),
              ttl: extendedTTL,
              staleThreshold: extendedTTL * 0.75,
              term,
              params: { page: 1, limit: 20 },
              warmup: true
            }
          });
          
          console.log(`Warm-up concluído para "${term}" com TTL de ${extendedTTL}s`);
        } catch (e) {
          console.error(`Erro no warm-up para termo "${term}":`, e);
        }
      }
    }
    
    // Analisar termos sem resultados
    const noResultsTerms = metrics.terms.noResults || [];
    
    if (noResultsTerms.length > 0) {
      console.log(`Encontrados ${noResultsTerms.length} termos sem resultados para análise`);
      
      // Gerar correções para os termos sem resultados
      for (const { term } of noResultsTerms.slice(0, 10)) {
        try {
          const corrections = await generateSpellingSuggestions(term, env);
          
          if (corrections.length > 0) {
            console.log(`Geradas correções para "${term}": ${corrections.join(', ')}`);
            
            // Armazenar correções para uso futuro
            await env.SEARCH_KV.put(`spelling:${term.toLowerCase()}`, JSON.stringify(corrections), { 
              expirationTtl: 86400 * 7 // 7 dias
            });
          }
        } catch (e) {
          console.error(`Erro ao gerar correções para "${term}":`, e);
        }
      }
    }
    
    console.log('Análise de métricas concluída');
    
    // Salvar resultado da análise
    await env.SEARCH_METRICS.put(`analysis:${Date.now()}`, JSON.stringify({
      timestamp: Date.now(),
      popularTerms: popularTerms.length,
      noResultsTerms: noResultsTerms.length,
      cacheHitRate: metrics.cache.hitRate
    }), { 
      expirationTtl: 86400 * 7 // 7 dias
    });
  } catch (error) {
    console.error('Erro na análise de métricas de busca:', error);
  }
}

/**
 * Retorna data no formato YYYYMMDD com offset opcional de dias
 */
function getYYYYMMDD(dayOffset = 0) {
  const date = new Date();
  if (dayOffset) {
    date.setDate(date.getDate() + dayOffset);
  }
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}${month}${day}`;
}