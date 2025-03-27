import type { APIRoute } from "astro";
import { server } from "../../actions";

// Log para diagnóstico - este arquivo está sendo carregado
console.log('Módulo de API /api/searchindex.ts carregado!');

export const GET: APIRoute = async (context) => {
  console.log('API: Novo endpoint de busca recebeu uma requisição');
  
  try {
    // Usar action para buscar produtos formatados para indexação
    const result = await server.search.getSearchIndex();
    
    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 500,
      headers: {
        'Content-Type': 'application/json'
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
};