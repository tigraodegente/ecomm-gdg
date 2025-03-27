import type { APIRoute } from "astro";
import { server } from "../../actions";

// Log para diagnóstico - este arquivo está sendo carregado
console.log('Módulo de API /api/search-products.ts carregado!');

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
    
    console.log(`API: Buscando produtos com termo "${term}" (página ${page}, categoria: ${category || 'todas'})`);
    
    // Usar action para buscar produtos com filtros adicionais
    const result = await server.search.searchProducts({
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
    
    // Adicionar headers para cache
    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60', // Cache por 1 minuto
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