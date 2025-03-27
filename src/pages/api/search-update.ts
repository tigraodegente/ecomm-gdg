import type { APIRoute } from "astro";
import { server } from "../../actions";

// Log para diagnóstico - este arquivo está sendo carregado
console.log('Módulo de API /api/search-update.ts carregado!');

export const POST: APIRoute = async (context) => {
  try {
    // Verificar token de autorização
    const auth = context.request.headers.get('Authorization');
    const expectedToken = import.meta.env.SEARCH_INDEX_TOKEN || 'dev-token-search-index';
    
    console.log('API: Recebida solicitação para atualizar índice de busca');
    
    // Se o token não for fornecido ou for inválido
    if (!auth || !auth.startsWith('Bearer ') || auth.replace('Bearer ', '') !== expectedToken) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Acesso não autorizado'
      }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
    
    // Obter dados para o índice utilizando a action
    const result = await server.search.getSearchIndex();
    
    // Retornar status de sucesso
    return new Response(JSON.stringify({
      success: true,
      message: 'Índice de busca atualizado com sucesso',
      productsIndexed: result.products?.length || 0
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Erro ao atualizar índice de busca:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: 'Erro interno no servidor'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
};