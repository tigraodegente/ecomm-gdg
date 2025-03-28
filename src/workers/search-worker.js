/**
 * Worker para o sistema de busca otimizado com FlexSearch no edge
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
    
    // Rota não encontrada
    return new Response('Not found', { status: 404 });
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
    
    // Gerar chave de cache com todos os parâmetros
    const cacheKey = `search:${term}:${page}:${limit}:${category || ''}:${minPrice || ''}:${maxPrice || ''}:${sort || ''}`;
    
    // Verificar se há resultado em cache
    const cachedResult = await env.CACHE_STORE.get(cacheKey, { type: 'json' });
    if (cachedResult) {
      return new Response(JSON.stringify(cachedResult), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60',
          'CF-Cache-Status': 'HIT'
        }
      });
    }
    
    let result;
    
    // Para termos curtos ou vazios, buscar diretamente do banco de dados
    if (!term || term.length < 3) {
      // Chamada simplificada para o backend
      // Em produção, isso seria uma chamada para o tursoProductService.searchProducts
      result = {
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
    } else {
      // Para termos de busca válidos, usar FlexSearch no edge
      // Carregar índice de busca
      const indexData = await env.SEARCH_INDEX.get('main');
      if (!indexData) {
        // Se o índice não existir, buscar do backend
        // Em produção, faria uma chamada para o backend
        result = await fallbackToBackend(term, page, limit, env);
      } else {
        // Usar FlexSearch no edge
        result = await searchWithFlexSearch(term, indexData, {
          page, 
          limit, 
          category, 
          minPrice, 
          maxPrice, 
          sort
        }, env);
      }
    }
    
    // Armazenar resultado em cache
    const ttl = term.length > 3 ? 300 : 60; // 5 min para buscas complexas, 1 min para simples
    await env.CACHE_STORE.put(cacheKey, JSON.stringify(result), { expirationTtl: ttl });
    
    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${ttl}`,
        'CF-Cache-Status': 'MISS'
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
 * Manipula requisições para obter o índice de busca
 */
async function handleSearchIndex(request, env, ctx) {
  try {
    // Verificar se há resultado em cache
    const cachedIndex = await env.CACHE_STORE.get('searchindex', { type: 'json' });
    if (cachedIndex) {
      return new Response(JSON.stringify(cachedIndex), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600',
          'CF-Cache-Status': 'HIT'
        }
      });
    }
    
    // Se não estiver em cache, buscar do namespace KV
    const rawIndex = await env.SEARCH_INDEX.get('searchindex_data');
    if (!rawIndex) {
      // Se não estiver no KV, retornar erro
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
    
    // Processar e preparar o índice para o cliente
    const index = JSON.parse(rawIndex);
    const clientIndex = prepareClientIndex(index);
    
    // Armazenar no cache por 1 hora
    await env.CACHE_STORE.put('searchindex', JSON.stringify(clientIndex), { expirationTtl: 3600 });
    
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
    
    // Buscar produtos para indexação (em produção, isso seria do Turso)
    // Aqui estamos simulando para o exemplo
    const products = await getProductsForIndexing(env);
    
    // Gerar o índice para FlexSearch
    const index = generateFlexSearchIndex(products);
    
    // Serializar o índice
    const serializedIndex = JSON.stringify(index);
    
    // Salvar no KV
    await env.SEARCH_INDEX.put('main', serializedIndex);
    
    // Salvar versão otimizada para cliente
    const clientIndex = {
      success: true,
      products: products.map(p => ({
        id: p.id,
        name: p.name,
        description: p.short_description || '',
        price: p.price,
        comparePrice: p.compare_at_price,
        image: p.mainImage || p.main_image,
        slug: p.slug,
        vendorName: p.vendor_name || '',
        category: p.category_name,
        searchData: p.searchData
      }))
    };
    
    await env.SEARCH_INDEX.put('searchindex_data', JSON.stringify(clientIndex));
    
    // Invalidar cache
    await env.CACHE_STORE.delete('searchindex');
    
    return new Response(JSON.stringify({
      success: true,
      productsIndexed: products.length,
      timestamp: Date.now()
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
 * Busca produtos usando FlexSearch no edge
 */
async function searchWithFlexSearch(term, indexData, options, env) {
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
    parsedIndex.products.forEach(product => {
      flexDocument.add(product);
    });
  }
  
  // Realizar a busca
  const searchResults = await flexDocument.search(term, {
    limit: options.limit * 3, // Buscar mais resultados para permitir filtragem
    suggest: true,
    enrich: true
  });
  
  // Extrair produtos únicos dos resultados
  const productMap = new Map();
  searchResults.forEach(result => {
    result.result.forEach(match => {
      if (match.doc && !productMap.has(match.doc.id)) {
        productMap.set(match.doc.id, match.doc);
      }
    });
  });
  
  // Converter para array
  let products = Array.from(productMap.values());
  
  // Aplicar filtros
  if (options.category) {
    products = products.filter(p => 
      p.category && p.category.toLowerCase() === options.category.toLowerCase()
    );
  }
  
  if (options.minPrice !== undefined) {
    products = products.filter(p => p.price >= options.minPrice);
  }
  
  if (options.maxPrice !== undefined) {
    products = products.filter(p => p.price <= options.maxPrice);
  }
  
  // Aplicar ordenação
  if (options.sort) {
    switch (options.sort) {
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
      // Relevância é o padrão (já ordenado pelo FlexSearch)
    }
  }
  
  // Paginar resultados
  const total = products.length;
  const startIndex = (options.page - 1) * options.limit;
  const paginatedProducts = products.slice(startIndex, startIndex + options.limit);
  
  // Calcular paginação
  const totalPages = Math.ceil(total / options.limit);
  
  // Gerar resposta
  return {
    success: true,
    products: paginatedProducts,
    pagination: {
      total,
      page: options.page,
      limit: options.limit,
      totalPages,
      hasNextPage: options.page < totalPages,
      hasPrevPage: options.page > 1
    }
  };
}

/**
 * Função de fallback para buscar do backend em caso de erro
 */
async function fallbackToBackend(term, page, limit, env) {
  // Em produção, isso seria uma chamada para o backend
  // Simulando uma resposta para este exemplo
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

/**
 * Simula a obtenção de produtos para indexação
 */
async function getProductsForIndexing(env) {
  // Em produção, isso viria do Turso
  // Retornando alguns produtos de exemplo para este caso
  return [
    {
      id: '1',
      name: 'Berço Montessoriano',
      short_description: 'Berço montessoriano em madeira natural',
      price: 899.90,
      compare_at_price: 999.90,
      mainImage: 'https://example.com/berco.jpg',
      slug: 'berco-montessoriano',
      vendor_name: 'Móveis Infantis Ltda',
      category_name: 'Berços',
      searchData: 'Berço Montessoriano madeira natural quarto bebê montessori'
    },
    {
      id: '2',
      name: 'Kit Enxoval Completo',
      short_description: 'Kit enxoval com 20 peças para bebê',
      price: 349.90,
      compare_at_price: 399.90,
      mainImage: 'https://example.com/enxoval.jpg',
      slug: 'kit-enxoval-completo',
      vendor_name: 'Baby Shop',
      category_name: 'Enxoval',
      searchData: 'Kit Enxoval Completo bebê roupa lençol fronha travesseiro'
    }
  ];
}

/**
 * Função para gerar o índice FlexSearch
 */
function generateFlexSearchIndex(products) {
  // Em produção, isso seria feito com a biblioteca FlexSearch
  // Simulando para este exemplo
  return {
    products: products.map(product => ({
      id: product.id,
      name: product.name,
      description: product.short_description,
      price: product.price,
      comparePrice: product.compare_at_price,
      image: product.mainImage || product.main_image,
      slug: product.slug,
      vendorName: product.vendor_name,
      category: product.category_name,
      searchData: product.searchData
    }))
  };
}

/**
 * Prepara o índice para uso no cliente
 */
function prepareClientIndex(index) {
  // Simplifica o índice removendo dados desnecessários
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
    }))
  };
}