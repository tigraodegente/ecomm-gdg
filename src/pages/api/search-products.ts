import type { APIRoute } from "astro";
import { server } from "../../actions";
import { Document } from "flexsearch";

// Log para diagnóstico - este arquivo está sendo carregado
console.log('Módulo de API /api/search-products.ts carregado!');

// Cache para índice FlexSearch
let flexSearchIndex = null;
let lastIndexUpdate = 0;
const INDEX_TTL = 3600000; // 1 hora em milissegundos

/**
 * Realiza busca otimizada usando FlexSearch
 */
async function searchWithFlexSearch(term, options) {
  // Verificar se precisamos recarregar o índice
  const now = Date.now();
  if (!flexSearchIndex || (now - lastIndexUpdate > INDEX_TTL)) {
    console.log('Carregando índice FlexSearch...');
    
    try {
      // Obter dados de produtos para indexação
      const { products } = await server.search.getSearchIndex();
      
      if (!products || !Array.isArray(products)) {
        console.error('Falha ao carregar produtos para indexação');
        return null;
      }
      
      // Criar novo índice FlexSearch
      flexSearchIndex = new Document({
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
      
      // Adicionar produtos ao índice
      for (const product of products) {
        flexSearchIndex.add(product);
      }
      
      lastIndexUpdate = now;
      console.log(`Índice FlexSearch carregado com ${products.length} produtos`);
    } catch (error) {
      console.error('Erro ao carregar índice FlexSearch:', error);
      return null;
    }
  }
  
  // Realizar a busca com FlexSearch
  try {
    const { page = 1, limit = 20, category, minPrice, maxPrice, sort } = options;
    
    // Configuração da busca
    const searchConfig = {
      limit: limit * 3, // Buscar mais resultados para permitir filtragem
      suggest: true,
      enrich: true
    };
    
    console.log(`Realizando busca FlexSearch para termo: "${term}"`);
    
    // Buscar em múltiplos campos
    const searchResults = [];
    
    // Prioridade de campos para busca
    const fields = ['name', 'searchData', 'description', 'category', 'vendorName'];
    const fieldWeights = { name: 10, searchData: 5, description: 3, category: 2, vendorName: 1 };
    
    for (const field of fields) {
      const results = await flexSearchIndex.search(field, term, searchConfig);
      if (results && results.length > 0) {
        searchResults.push(...results);
      }
    }
    
    // Extrair produtos únicos e calcular score
    const productMap = new Map();
    let maxScore = 0;
    
    searchResults.forEach(result => {
      result.result.forEach(match => {
        if (match.doc) {
          const product = match.doc;
          let score = 0;
          
          // Verificar cada campo para calcular score
          for (const field of fields) {
            if (product[field] && product[field].toLowerCase().includes(term.toLowerCase())) {
              // Adicionar peso com base no campo
              score += fieldWeights[field] || 1;
              
              // Bônus para correspondências exatas
              if (field === 'name' && product.name.toLowerCase() === term.toLowerCase()) {
                score += 15;
              }
              // Bônus para termo no início do nome
              else if (field === 'name' && product.name.toLowerCase().startsWith(term.toLowerCase())) {
                score += 10;
              }
            }
          }
          
          // Atualizar score máximo encontrado
          if (score > maxScore) maxScore = score;
          
          // Se produto já existe no mapa, atualizar apenas se o score for maior
          if (productMap.has(product.id)) {
            const existing = productMap.get(product.id);
            if (score > existing._score) {
              productMap.set(product.id, { ...product, _score: score });
            }
          } else {
            productMap.set(product.id, { ...product, _score: score });
          }
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
        default:
          // Padrão: ordenar por relevância (score)
          products.sort((a, b) => b._score - a._score);
      }
    } else {
      // Sem ordenação específica, usar relevância
      products.sort((a, b) => b._score - a._score);
    }
    
    // Gerar filtros disponíveis
    const filters = generateFiltersFromProducts(products);
    
    // Paginar resultados
    const total = products.length;
    const startIndex = (page - 1) * limit;
    const paginatedProducts = products.slice(startIndex, startIndex + limit);
    
    // Calcular paginação
    const totalPages = Math.ceil(total / limit);
    
    // Gerar sugestões para termos com poucos resultados
    let suggestions = [];
    if (products.length < 5 && term.length >= 3) {
      suggestions = generateSearchSuggestions(term, products);
    }
    
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
      filters,
      suggestions,
      appliedFilters: {
        term,
        category,
        minPrice,
        maxPrice,
        sort
      }
    };
  } catch (error) {
    console.error('Erro na busca com FlexSearch:', error);
    return null;
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
 * Gera sugestões de busca para termos com poucos resultados
 */
function generateSearchSuggestions(term, products) {
  const suggestions = [];
  
  // 1. Sugestões com variações do termo
  if (term.length > 4) {
    suggestions.push(term.slice(0, -1)); // Remover último caractere
    suggestions.push(term.slice(0, -2) + term.slice(-1)); // Remover penúltimo caractere
  }
  
  // 2. Sugestões de nomes de produtos similares
  const similarities = products.map(product => {
    const name = product.name.toLowerCase();
    let score = 0;
    
    // Contar letras comuns
    for (let i = 0; i < term.length; i++) {
      if (name.includes(term[i])) score += 1;
    }
    
    return { term: product.name, score: score / term.length };
  });
  
  // Adicionar nomes de produtos com alta similaridade
  similarities
    .filter(s => s.score > 0.6)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .forEach(s => suggestions.push(s.term));
  
  // Remover duplicatas e limitar a 3 sugestões
  return [...new Set(suggestions)].slice(0, 3);
}

export const GET: APIRoute = async (context) => {
  try {
    // Extrair parâmetros da query
    const url = new URL(context.request.url);
    const term = url.searchParams.get('q') || '';
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const category = url.searchParams.get('category') || undefined;
    const minPrice = url.searchParams.get('minPrice') ? parseFloat(url.searchParams.get('minPrice')!) : undefined;
    const maxPrice = url.searchParams.get('maxPrice') ? parseFloat(url.searchParams.get('maxPrice')!) : undefined;
    const sort = url.searchParams.get('sort') || undefined;
    
    console.log(`API: Buscando produtos do banco com termo "${term}" (página ${page}, categoria: ${category || 'todas'})`);
    
    // Se o termo for vazio ou muito curto, usar busca tradicional
    let result;
    if (!term || term.length < 2) {
      result = await server.search.searchProducts({
        term,
        page,
        limit,
        filters: {
          category,
          minPrice,
          maxPrice,
          sort
        }
      });
    } else {
      // Usar busca otimizada com FlexSearch para termos significativos
      const flexSearchResult = await searchWithFlexSearch(term, {
        page,
        limit,
        category,
        minPrice,
        maxPrice,
        sort
      });
      
      if (flexSearchResult) {
        result = flexSearchResult;
      } else {
        // Fallback para o serviço tradicional se a busca FlexSearch falhar
        console.log('FlexSearch falhou, usando busca tradicional como fallback');
        result = await server.search.searchProducts({
          term,
          page,
          limit,
          filters: {
            category,
            minPrice,
            maxPrice,
            sort
          }
        });
      }
    }
    
    // Calcular TTL do cache baseado no termo
    let cacheTTL = 60; // Padrão: 1 minuto
    
    if (term.length > 3) {
      cacheTTL = 300; // 5 minutos para termos mais específicos
    }
    if (term.length > 6) {
      cacheTTL = 600; // 10 minutos para termos muito específicos
    }
    
    // Adicionar headers para cache
    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${cacheTTL}`,
        'Vary': 'Accept-Encoding, Cookie'
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
};