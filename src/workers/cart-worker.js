/**
 * Worker para gerenciamento de carrinho com Durable Objects
 */

// Durable Object para gerenciar o estado do carrinho
export class CartDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.cart = null;
    this.sessionId = null;
  }
  
  async initialize(sessionId) {
    this.sessionId = sessionId;
    // Carregar o carrinho do armazenamento persistente
    this.cart = await this.state.storage.get('cart') || { 
      items: [], 
      count: 0,
      updatedAt: Date.now(),
      sessionId
    };
  }
  
  // Método principal para lidar com requisições
  async fetch(request) {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId') || 
                      request.headers.get('X-Session-ID') || 
                      'anonymous';
    
    if (!this.cart || this.sessionId !== sessionId) {
      await this.initialize(sessionId);
    }
    
    // Router baseado em método e path
    if (request.method === 'GET' && url.pathname === '/api/cart') {
      return this.getCart();
    }
    
    if (request.method === 'POST' && url.pathname === '/api/cart/add') {
      return this.addItem(request);
    }
    
    if (request.method === 'POST' && url.pathname === '/api/cart/update') {
      return this.updateItem(request);
    }
    
    if (request.method === 'POST' && url.pathname === '/api/cart/remove') {
      return this.removeItem(request);
    }
    
    if (request.method === 'POST' && url.pathname === '/api/cart/clear') {
      return this.clearCart();
    }
    
    return new Response('Not found', { status: 404 });
  }
  
  // Retorna o carrinho atual
  async getCart() {
    return this.jsonResponse(this.cart);
  }
  
  // Adiciona um item ao carrinho
  async addItem(request) {
    try {
      const data = await request.json();
      const { product, quantity = 1, options = {} } = data;
      
      if (!product || !product.id) {
        return this.jsonResponse({ error: 'Produto inválido' }, 400);
      }
      
      // Verificar estoque em tempo real (opcional)
      const stockCheck = await this.checkProductStock(product.id, quantity);
      if (stockCheck && !stockCheck.available) {
        return this.jsonResponse({ 
          error: 'Produto sem estoque suficiente',
          availableQuantity: stockCheck.remaining
        }, 400);
      }
      
      // Verificar se o item já existe no carrinho
      const existingItemIndex = this.cart.items.findIndex(item => 
        item.id === product.id && 
        JSON.stringify(item.options || {}) === JSON.stringify(options)
      );
      
      if (existingItemIndex >= 0) {
        // Atualizar quantidade do item existente
        this.cart.items[existingItemIndex].quantity += quantity;
      } else {
        // Adicionar novo item
        this.cart.items.push({
          ...product,
          quantity,
          options,
          addedAt: Date.now()
        });
      }
      
      // Atualizar contagem e timestamp
      this.cart.count = this.cart.items.reduce((total, item) => total + item.quantity, 0);
      this.cart.updatedAt = Date.now();
      
      // Persistir mudanças
      await this.state.storage.put('cart', this.cart);
      
      return this.jsonResponse(this.cart);
    } catch (error) {
      console.error('Erro ao adicionar item ao carrinho:', error);
      return this.jsonResponse({ error: 'Erro ao processar requisição' }, 500);
    }
  }
  
  // Atualiza um item no carrinho
  async updateItem(request) {
    try {
      const data = await request.json();
      const { id, quantity, options } = data;
      
      if (!id) {
        return this.jsonResponse({ error: 'ID do item não fornecido' }, 400);
      }
      
      // Encontrar o item no carrinho
      const itemIndex = this.cart.items.findIndex(item => 
        item.id === id &&
        JSON.stringify(item.options || {}) === JSON.stringify(options || {})
      );
      
      if (itemIndex === -1) {
        return this.jsonResponse({ error: 'Item não encontrado no carrinho' }, 404);
      }
      
      if (quantity <= 0) {
        // Remover item se quantidade <= 0
        this.cart.items.splice(itemIndex, 1);
      } else {
        // Verificar estoque em tempo real (opcional)
        const stockCheck = await this.checkProductStock(id, quantity);
        if (stockCheck && !stockCheck.available) {
          return this.jsonResponse({ 
            error: 'Quantidade maior que estoque disponível',
            availableQuantity: stockCheck.remaining
          }, 400);
        }
        
        // Atualizar quantidade
        this.cart.items[itemIndex].quantity = quantity;
        
        // Atualizar opções, se fornecidas
        if (options) {
          this.cart.items[itemIndex].options = options;
        }
      }
      
      // Atualizar contagem e timestamp
      this.cart.count = this.cart.items.reduce((total, item) => total + item.quantity, 0);
      this.cart.updatedAt = Date.now();
      
      // Persistir mudanças
      await this.state.storage.put('cart', this.cart);
      
      return this.jsonResponse(this.cart);
    } catch (error) {
      console.error('Erro ao atualizar item do carrinho:', error);
      return this.jsonResponse({ error: 'Erro ao processar requisição' }, 500);
    }
  }
  
  // Remove um item do carrinho
  async removeItem(request) {
    try {
      const data = await request.json();
      const { id, options = {} } = data;
      
      if (!id) {
        return this.jsonResponse({ error: 'ID do item não fornecido' }, 400);
      }
      
      // Filtrar o item
      this.cart.items = this.cart.items.filter(item => 
        !(item.id === id && JSON.stringify(item.options || {}) === JSON.stringify(options))
      );
      
      // Atualizar contagem e timestamp
      this.cart.count = this.cart.items.reduce((total, item) => total + item.quantity, 0);
      this.cart.updatedAt = Date.now();
      
      // Persistir mudanças
      await this.state.storage.put('cart', this.cart);
      
      return this.jsonResponse(this.cart);
    } catch (error) {
      console.error('Erro ao remover item do carrinho:', error);
      return this.jsonResponse({ error: 'Erro ao processar requisição' }, 500);
    }
  }
  
  // Limpa o carrinho
  async clearCart() {
    this.cart.items = [];
    this.cart.count = 0;
    this.cart.updatedAt = Date.now();
    
    // Persistir mudanças
    await this.state.storage.put('cart', this.cart);
    
    return this.jsonResponse(this.cart);
  }
  
  // Verifica disponibilidade de estoque
  async checkProductStock(productId, quantity) {
    // Em produção, isso consultaria o Turso ou KV para obter estoque em tempo real
    
    // Simular estoque para este exemplo
    const stockKey = `stock:${productId}`;
    
    try {
      // Tentar obter de KV
      const stockData = await this.env.PRODUCT_CACHE.get(stockKey, {type: 'json'});
      
      if (stockData) {
        return {
          available: stockData.quantity >= quantity,
          remaining: stockData.quantity
        };
      }
      
      // Para este exemplo, assumir que está disponível se não encontrado
      return { available: true, remaining: 999 };
    } catch (error) {
      console.error('Erro ao verificar estoque:', error);
      // Failsafe: permitir a operação
      return { available: true };
    }
  }
  
  // Helper para responder em JSON
  jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}

// Worker principal que roteia requisições para o Durable Object
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Extrai ID de sessão do cookie, URL ou cabeçalho
    const cookies = parseCookies(request.headers.get('Cookie') || '');
    const sessionId = url.searchParams.get('sessionId') || 
                      cookies.sessionId || 
                      request.headers.get('X-Session-ID') || 
                      'anonymous';
    
    // Criar um ID para o Durable Object baseado na sessão
    const cartId = env.CART.idFromName(sessionId);
    const cartObject = env.CART.get(cartId);
    
    // Reencaminhar a requisição para o Durable Object
    return cartObject.fetch(request);
  }
};

// Helper para analisar cookies
function parseCookies(cookieHeader) {
  const cookies = {};
  if (cookieHeader) {
    cookieHeader.split(';').forEach(cookie => {
      const [name, value] = cookie.trim().split('=');
      cookies[name] = decodeURIComponent(value);
    });
  }
  return cookies;
}