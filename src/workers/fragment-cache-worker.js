/**
 * Worker para cache de fragmentos HTML
 * 
 * Permite caching de partes de páginas HTML (como cards de produto, menus, etc.)
 * para reutilização entre páginas sem precisar renderizar novamente.
 * 
 * Características:
 * - Cache de fragmentos HTML identificados por ID
 * - Diferentes estratégias de cache por tipo de fragmento
 * - Versionamento para invalidação seletiva
 * - Suporte a Streaming SSR
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // 1. Endpoint para obtenção de fragmento
    if (path.startsWith('/api/fragment/')) {
      return await handleFragmentRequest(request, env, ctx);
    }
    
    // 2. Endpoint para renderização de fragmento
    if (path.startsWith('/api/render-fragment/')) {
      return await handleFragmentRendering(request, env, ctx);
    }
    
    // 3. Endpoint para invalidação de fragmento
    if (path === '/api/fragment/invalidate' && request.method === 'POST') {
      return await handleFragmentInvalidation(request, env, ctx);
    }
    
    // 4. Endpoint para listar fragmentos em cache
    if (path === '/api/fragment/list' && request.method === 'GET') {
      return await handleFragmentListRequest(request, env, ctx);
    }
    
    // Rota não encontrada
    return new Response('Endpoint não encontrado', { status: 404 });
  },
  
  // Executar tarefas agendadas
  async scheduled(event, env, ctx) {
    // Limpeza de fragmentos expirados
    if (event.cron === '0 4 * * *') {
      await cleanupExpiredFragments(env);
    }
  }
};

/**
 * Handler para requisição de fragmento
 */
async function handleFragmentRequest(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // Extrair ID do fragmento da URL
  const fragmentId = path.replace('/api/fragment/', '');
  if (!fragmentId) {
    return new Response('ID do fragmento não especificado', { status: 400 });
  }
  
  // Obter parâmetros adicionais
  const version = url.searchParams.get('v') || 'latest';
  const locale = url.searchParams.get('locale') || 'pt-BR';
  
  // Gerar chave de cache
  const cacheKey = `fragment:${fragmentId}:${version}:${locale}`;
  
  // Verificar se temos em cache
  const cachedFragment = await env.CACHE_STORE.get(cacheKey);
  
  if (cachedFragment) {
    return new Response(cachedFragment, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'CF-Cache-Status': 'HIT',
        'Cache-Control': 'public, max-age=60, s-maxage=300'
      }
    });
  }
  
  // Cache miss - redirecionar para a origem para renderização
  return Response.redirect(`${url.origin}/api/render-fragment/${fragmentId}?${url.searchParams.toString()}`, 307);
}

/**
 * Handler para renderização de fragmento
 */
async function handleFragmentRendering(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // Extrair ID do fragmento da URL
  const fragmentId = path.replace('/api/render-fragment/', '');
  if (!fragmentId) {
    return new Response('ID do fragmento não especificado', { status: 400 });
  }
  
  // Obter parâmetros adicionais
  const version = url.searchParams.get('v') || 'latest';
  const locale = url.searchParams.get('locale') || 'pt-BR';
  const params = Object.fromEntries(url.searchParams.entries());
  
  try {
    // Determinar tipo de fragmento
    const fragmentType = getFragmentType(fragmentId);
    
    // Renderizar o fragmento (simulado)
    const htmlContent = await renderFragment(fragmentId, params, env);
    
    if (!htmlContent) {
      return new Response('Fragmento não encontrado', { status: 404 });
    }
    
    // Determinar TTL baseado no tipo de fragmento
    const ttl = getFragmentTTL(fragmentType, fragmentId);
    
    // Armazenar no cache
    const cacheKey = `fragment:${fragmentId}:${version}:${locale}`;
    await env.CACHE_STORE.put(cacheKey, htmlContent, { expirationTtl: ttl });
    
    // Também atualizar o registro de fragmentos
    await updateFragmentRegistry(fragmentId, version, locale, fragmentType, ttl, env);
    
    return new Response(htmlContent, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'CF-Cache-Status': 'MISS',
        'Cache-Control': 'public, max-age=60, s-maxage=300'
      }
    });
  } catch (error) {
    console.error('Erro ao renderizar fragmento:', error);
    return new Response('Erro ao renderizar fragmento', { status: 500 });
  }
}

/**
 * Handler para invalidação de fragmento
 */
async function handleFragmentInvalidation(request, env, ctx) {
  try {
    const auth = request.headers.get('Authorization');
    if (!isValidAuthToken(auth, env)) {
      return new Response('Não autorizado', { status: 401 });
    }
    
    const data = await request.json();
    const { fragmentIds, types, versions } = data;
    
    if (!fragmentIds && !types) {
      return new Response('Especifique fragmentIds ou types para invalidação', { status: 400 });
    }
    
    // Iniciar invalidação em background
    ctx.waitUntil(invalidateFragments(fragmentIds, types, versions, env));
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Invalidação de fragmentos iniciada'
    }), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Erro ao invalidar fragmentos:', error);
    return new Response('Erro ao processar requisição', { status: 500 });
  }
}

/**
 * Handler para listar fragmentos em cache
 */
async function handleFragmentListRequest(request, env, ctx) {
  try {
    const auth = request.headers.get('Authorization');
    if (!isValidAuthToken(auth, env)) {
      return new Response('Não autorizado', { status: 401 });
    }
    
    const url = new URL(request.url);
    const type = url.searchParams.get('type');
    
    // Obter registro de fragmentos
    const registry = await getFragmentRegistry(env);
    
    // Filtrar por tipo, se especificado
    let fragments = registry.fragments;
    if (type) {
      fragments = fragments.filter(f => f.type === type);
    }
    
    return new Response(JSON.stringify({
      success: true,
      fragments,
      count: fragments.length
    }), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Erro ao listar fragmentos:', error);
    return new Response('Erro ao processar requisição', { status: 500 });
  }
}

/**
 * Invalida fragmentos em cache
 */
async function invalidateFragments(fragmentIds, types, versions, env) {
  try {
    const registry = await getFragmentRegistry(env);
    const keysToDelete = [];
    
    // Filtrar fragmentos para invalidação
    for (const fragment of registry.fragments) {
      let shouldInvalidate = false;
      
      // Invalidar por ID
      if (fragmentIds && fragmentIds.includes(fragment.id)) {
        shouldInvalidate = true;
      }
      
      // Invalidar por tipo
      if (types && types.includes(fragment.type)) {
        shouldInvalidate = true;
      }
      
      // Filtrar por versão, se especificada
      if (versions && shouldInvalidate) {
        shouldInvalidate = versions.includes(fragment.version) || versions.includes('all');
      }
      
      if (shouldInvalidate) {
        keysToDelete.push(`fragment:${fragment.id}:${fragment.version}:${fragment.locale}`);
      }
    }
    
    // Excluir todas as chaves em paralelo
    const deletePromises = keysToDelete.map(key => env.CACHE_STORE.delete(key));
    await Promise.all(deletePromises);
    
    // Atualizar registro para remover fragmentos invalidados
    await updateFragmentRegistryAfterInvalidation(keysToDelete, env);
    
    console.log(`${keysToDelete.length} fragmentos invalidados`);
  } catch (error) {
    console.error('Erro ao invalidar fragmentos:', error);
  }
}

/**
 * Limpa fragmentos expirados
 */
async function cleanupExpiredFragments(env) {
  try {
    const registry = await getFragmentRegistry(env);
    const now = Date.now();
    
    // Filtrar fragmentos expirados
    const expiredFragments = registry.fragments.filter(fragment => {
      return fragment.expiresAt && fragment.expiresAt < now;
    });
    
    // Gerar lista de chaves para excluir
    const keysToDelete = expiredFragments.map(fragment => 
      `fragment:${fragment.id}:${fragment.version}:${fragment.locale}`
    );
    
    // Excluir chaves expiradas
    const deletePromises = keysToDelete.map(key => env.CACHE_STORE.delete(key));
    await Promise.all(deletePromises);
    
    // Atualizar registro para remover fragmentos expirados
    await updateFragmentRegistryAfterInvalidation(keysToDelete, env);
    
    console.log(`${keysToDelete.length} fragmentos expirados foram limpos`);
  } catch (error) {
    console.error('Erro ao limpar fragmentos expirados:', error);
  }
}

/**
 * Obtém o registro de fragmentos
 */
async function getFragmentRegistry(env) {
  try {
    const registry = await env.CACHE_STORE.get('fragment_registry', { type: 'json' });
    return registry || { fragments: [] };
  } catch (error) {
    console.error('Erro ao obter registro de fragmentos:', error);
    return { fragments: [] };
  }
}

/**
 * Atualiza o registro de fragmentos
 */
async function updateFragmentRegistry(fragmentId, version, locale, type, ttl, env) {
  try {
    const registry = await getFragmentRegistry(env);
    
    // Calcular timestamp de expiração
    const expiresAt = Date.now() + (ttl * 1000);
    
    // Verificar se o fragmento já existe
    const existingIndex = registry.fragments.findIndex(f => 
      f.id === fragmentId && f.version === version && f.locale === locale
    );
    
    if (existingIndex >= 0) {
      // Atualizar existente
      registry.fragments[existingIndex] = {
        id: fragmentId,
        version,
        locale,
        type,
        expiresAt,
        updatedAt: Date.now()
      };
    } else {
      // Adicionar novo
      registry.fragments.push({
        id: fragmentId,
        version,
        locale,
        type,
        expiresAt,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }
    
    // Salvar registro atualizado
    await env.CACHE_STORE.put('fragment_registry', JSON.stringify(registry));
  } catch (error) {
    console.error('Erro ao atualizar registro de fragmentos:', error);
  }
}

/**
 * Atualiza o registro após invalidação
 */
async function updateFragmentRegistryAfterInvalidation(invalidatedKeys, env) {
  try {
    const registry = await getFragmentRegistry(env);
    
    // Mapear chaves para ID/versão/locale
    const invalidatedFragments = invalidatedKeys.map(key => {
      const parts = key.replace('fragment:', '').split(':');
      return {
        id: parts[0],
        version: parts[1],
        locale: parts[2]
      };
    });
    
    // Filtrar fragmentos não invalidados
    registry.fragments = registry.fragments.filter(fragment => {
      return !invalidatedFragments.some(invalid => 
        invalid.id === fragment.id && 
        invalid.version === fragment.version && 
        invalid.locale === fragment.locale
      );
    });
    
    // Salvar registro atualizado
    await env.CACHE_STORE.put('fragment_registry', JSON.stringify(registry));
  } catch (error) {
    console.error('Erro ao atualizar registro após invalidação:', error);
  }
}

/**
 * Determina o tipo de fragmento
 */
function getFragmentType(fragmentId) {
  if (fragmentId.startsWith('product-card-')) {
    return 'product-card';
  } else if (fragmentId.startsWith('category-menu-')) {
    return 'category-menu';
  } else if (fragmentId.startsWith('featured-')) {
    return 'featured-products';
  } else if (fragmentId.startsWith('review-')) {
    return 'review';
  } else {
    return 'generic';
  }
}

/**
 * Determina TTL baseado no tipo de fragmento
 */
function getFragmentTTL(type, id) {
  switch (type) {
    case 'product-card':
      return 3600; // 1 hora
    case 'category-menu':
      return 43200; // 12 horas
    case 'featured-products':
      return 1800; // 30 minutos
    case 'review':
      return 86400; // 24 horas
    case 'generic':
    default:
      return 7200; // 2 horas
  }
}

/**
 * Verifica se o token de autorização é válido
 */
function isValidAuthToken(authHeader, env) {
  if (!authHeader) return false;
  
  const token = authHeader.replace('Bearer ', '');
  return token === env.CACHE_AUTH_TOKEN;
}

/**
 * Renderiza um fragmento HTML (simulado)
 */
async function renderFragment(fragmentId, params, env) {
  // Em produção, isso faria uma solicitação para o backend para renderizar o fragmento
  // Para este exemplo, simular alguns fragmentos HTML
  
  if (fragmentId.startsWith('product-card-')) {
    const productId = fragmentId.replace('product-card-', '');
    return `
      <div class="product-card" data-product-id="${productId}">
        <div class="product-image">
          <img src="https://example.com/product${productId}.jpg" alt="Produto ${productId}">
        </div>
        <div class="product-info">
          <h3>Produto ${productId}</h3>
          <p class="price">R$ 99,90</p>
          <button class="add-to-cart">Adicionar ao Carrinho</button>
        </div>
      </div>
    `;
  } else if (fragmentId === 'category-menu-main') {
    return `
      <nav class="category-menu">
        <ul>
          <li><a href="/produtos/categoria-1">Categoria 1</a></li>
          <li><a href="/produtos/categoria-2">Categoria 2</a></li>
          <li><a href="/produtos/categoria-3">Categoria 3</a></li>
        </ul>
      </nav>
    `;
  } else if (fragmentId === 'featured-home') {
    return `
      <section class="featured-products">
        <h2>Produtos em Destaque</h2>
        <div class="product-grid">
          <!-- Simulando múltiplos produtos em destaque -->
          <div class="product-card">Produto Destaque 1</div>
          <div class="product-card">Produto Destaque 2</div>
          <div class="product-card">Produto Destaque 3</div>
        </div>
      </section>
    `;
  }
  
  return null;
}