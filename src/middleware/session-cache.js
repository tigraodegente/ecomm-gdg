/**
 * Middleware para otimização de cache de sessão de usuário
 * 
 * Implementa estratégias avançadas para caching de dados de sessão de usuário
 * usando Cloudflare KV e Durable Objects para persistência entre dispositivos.
 * 
 * Características:
 * - Armazenamento de sessão no edge próximo ao usuário
 * - Sincronização multi-dispositivo
 * - Persistência de longa duração
 * - Segurança e criptografia
 */

export const onRequest = async (context, next) => {
  // Verificar se o usuário tem um ID de sessão
  const sessionId = getSessionId(context.request);
  
  // Se não tiver sessão, criar uma nova
  if (!sessionId) {
    return await handleNewSession(context, next);
  }
  
  // Tentar carregar dados da sessão do KV ou Durable Object
  await loadSessionData(context, sessionId);
  
  // Executar o handler principal
  const response = await next();
  
  // Atualizar headers para cookies de sessão
  const responseWithSession = addSessionHeaders(response, context);
  
  // Armazenar atualizações de sessão se necessário
  if (context.sessionModified) {
    await storeSessionData(context, sessionId);
  }
  
  return responseWithSession;
};

/**
 * Obtém o ID de sessão atual do cookie ou header
 */
function getSessionId(request) {
  // Verificar no cookie
  const cookies = parseCookies(request.headers.get('Cookie') || '');
  if (cookies.sessionId) {
    return cookies.sessionId;
  }
  
  // Verificar no header (para APIs)
  return request.headers.get('X-Session-ID');
}

/**
 * Cria e manipula uma nova sessão
 */
async function handleNewSession(context, next) {
  // Gerar novo ID de sessão
  const sessionId = generateSessionId();
  
  // Registrar que estamos criando uma nova sessão
  context.locals.session = {
    id: sessionId,
    isNew: true,
    data: {},
    lastAccessed: Date.now()
  };
  
  // Executar o handler principal
  const response = await next();
  
  // Adicionar cookie de sessão à resposta
  const responseWithCookie = addSessionCookie(response, sessionId);
  
  // Armazenar a nova sessão
  await storeSessionData(context, sessionId);
  
  return responseWithCookie;
}

/**
 * Carrega dados da sessão
 */
async function loadSessionData(context, sessionId) {
  try {
    // Verificar primeiro no Durable Object para sessões ativas
    let sessionData = await loadSessionFromDurableObject(context.env, sessionId);
    
    // Se não encontrar no Durable Object, verificar no KV (sessões menos ativas)
    if (!sessionData) {
      sessionData = await loadSessionFromKV(context.env, sessionId);
    }
    
    if (sessionData) {
      // Sessão encontrada
      context.locals.session = {
        id: sessionId,
        isNew: false,
        data: sessionData,
        lastAccessed: Date.now()
      };
    } else {
      // Sessão não encontrada ou expirada, criar nova
      context.locals.session = {
        id: sessionId,
        isNew: true,
        data: {},
        lastAccessed: Date.now()
      };
    }
    
    // Função helper para modificar a sessão
    context.locals.session.set = (key, value) => {
      context.locals.session.data[key] = value;
      context.sessionModified = true;
    };
    
    context.locals.session.get = (key, defaultValue = null) => {
      return context.locals.session.data[key] !== undefined 
        ? context.locals.session.data[key] 
        : defaultValue;
    };
    
    context.locals.session.remove = (key) => {
      delete context.locals.session.data[key];
      context.sessionModified = true;
    };
    
    context.locals.session.clear = () => {
      context.locals.session.data = {};
      context.sessionModified = true;
    };
    
  } catch (error) {
    console.error('Erro ao carregar dados da sessão:', error);
    
    // Criar sessão vazia em caso de erro
    context.locals.session = {
      id: sessionId,
      isNew: true,
      data: {},
      lastAccessed: Date.now()
    };
  }
}

/**
 * Carrega sessão do Durable Object
 */
async function loadSessionFromDurableObject(env, sessionId) {
  try {
    if (!env.SESSION_STORE) {
      return null;
    }
    
    // Gerar ID para o Durable Object baseado na sessão
    const id = env.SESSION_STORE.idFromName(sessionId);
    const stub = env.SESSION_STORE.get(id);
    
    // Executar operação de leitura no Durable Object
    const response = await stub.fetch(new Request(`https://session-store/get?id=${sessionId}`));
    
    if (response.status === 200) {
      return await response.json();
    }
    
    return null;
  } catch (error) {
    console.error('Erro ao carregar sessão do Durable Object:', error);
    return null;
  }
}

/**
 * Carrega sessão do KV
 */
async function loadSessionFromKV(env, sessionId) {
  try {
    if (!env.SESSION_KV) {
      return null;
    }
    
    const sessionKey = `session:${sessionId}`;
    return await env.SESSION_KV.get(sessionKey, { type: 'json' });
  } catch (error) {
    console.error('Erro ao carregar sessão do KV:', error);
    return null;
  }
}

/**
 * Armazena dados da sessão
 */
async function storeSessionData(context, sessionId) {
  try {
    // Definir dados de expiração e acesso
    const sessionData = {
      ...context.locals.session.data,
      _lastAccessed: Date.now()
    };
    
    // Determinar TTL baseado no tipo de sessão
    const isAuthSession = !!sessionData.userId;
    const ttl = isAuthSession ? 2592000 : 86400; // 30 dias para autenticados, 1 dia para anônimos
    
    // Verificar se vale a pena armazenar no Durable Object (mais caro)
    const shouldUseDurableObject = isAuthSession || Object.keys(sessionData).length > 2;
    
    // Armazenar no local apropriado
    if (shouldUseDurableObject && context.env.SESSION_STORE) {
      await storeSessionInDurableObject(context.env, sessionId, sessionData);
    } else if (context.env.SESSION_KV) {
      await storeSessionInKV(context.env, sessionId, sessionData, ttl);
    }
  } catch (error) {
    console.error('Erro ao armazenar dados da sessão:', error);
  }
}

/**
 * Armazena sessão no Durable Object
 */
async function storeSessionInDurableObject(env, sessionId, sessionData) {
  try {
    const id = env.SESSION_STORE.idFromName(sessionId);
    const stub = env.SESSION_STORE.get(id);
    
    // Executar operação de escrita no Durable Object
    await stub.fetch(new Request('https://session-store/set', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: sessionId,
        data: sessionData
      })
    }));
  } catch (error) {
    console.error('Erro ao armazenar sessão no Durable Object:', error);
    
    // Fallback para KV em caso de erro
    if (env.SESSION_KV) {
      await storeSessionInKV(env, sessionId, sessionData, 86400);
    }
  }
}

/**
 * Armazena sessão no KV
 */
async function storeSessionInKV(env, sessionId, sessionData, ttl) {
  try {
    const sessionKey = `session:${sessionId}`;
    await env.SESSION_KV.put(sessionKey, JSON.stringify(sessionData), {
      expirationTtl: ttl
    });
  } catch (error) {
    console.error('Erro ao armazenar sessão no KV:', error);
  }
}

/**
 * Adiciona headers de sessão à resposta
 */
function addSessionHeaders(response, context) {
  // Clone da resposta para não modificar a original
  const newResponse = new Response(response.body, response);
  
  // Verificar se temos uma sessão para adicionar ao cookie
  if (context.locals.session && context.locals.session.id) {
    return addSessionCookie(newResponse, context.locals.session.id);
  }
  
  return newResponse;
}

/**
 * Adiciona cookie de sessão à resposta
 */
function addSessionCookie(response, sessionId) {
  // Clone da resposta para não modificar a original
  const newResponse = new Response(response.body, response);
  
  // Definir cookie de sessão com atributos de segurança adequados
  const secure = true; // Sempre usar HTTPS em produção
  const sameSite = 'lax'; // Permitir navegações normais, mas proteger contra CSRF
  const maxAge = 2592000; // 30 dias em segundos
  
  const cookieValue = `sessionId=${sessionId}; Path=/; Max-Age=${maxAge}; ${secure ? 'Secure; ' : ''}SameSite=${sameSite}; HttpOnly`;
  
  newResponse.headers.append('Set-Cookie', cookieValue);
  
  return newResponse;
}

/**
 * Gera um ID de sessão único
 */
function generateSessionId() {
  return crypto.randomUUID();
}

/**
 * Parse de cookies da requisição
 */
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

// Exportar Durable Object para gerenciamento de sessão

export class SessionDurableObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Operação de leitura (GET)
    if (request.method === 'GET' && path === '/get') {
      return await this.handleGetSession(url);
    }
    
    // Operação de escrita (POST)
    if (request.method === 'POST' && path === '/set') {
      return await this.handleSetSession(request);
    }
    
    // Operação de exclusão (DELETE)
    if (request.method === 'DELETE' && path === '/delete') {
      return await this.handleDeleteSession(url);
    }
    
    return new Response('Método não suportado', { status: 405 });
  }
  
  async handleGetSession(url) {
    const sessionId = url.searchParams.get('id');
    
    if (!sessionId) {
      return new Response('ID de sessão não fornecido', { status: 400 });
    }
    
    // Ler dados da sessão do armazenamento do Durable Object
    const sessionData = await this.state.storage.get(sessionId);
    
    if (!sessionData) {
      return new Response('Sessão não encontrada', { status: 404 });
    }
    
    // Atualizar timestamp de último acesso
    sessionData._lastAccessed = Date.now();
    await this.state.storage.put(sessionId, sessionData);
    
    return new Response(JSON.stringify(sessionData), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  async handleSetSession(request) {
    try {
      const { id, data } = await request.json();
      
      if (!id || !data) {
        return new Response('ID ou dados da sessão não fornecidos', { status: 400 });
      }
      
      // Armazenar dados da sessão
      await this.state.storage.put(id, data);
      
      // Se estamos armazenando uma sessão autenticada, também fazer backup no KV
      if (data.userId && this.env.SESSION_KV) {
        const sessionKey = `session:${id}`;
        await this.env.SESSION_KV.put(sessionKey, JSON.stringify(data), {
          expirationTtl: 2592000 // 30 dias (backup de longa duração)
        });
      }
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response('Erro ao processar requisição', { status: 500 });
    }
  }
  
  async handleDeleteSession(url) {
    const sessionId = url.searchParams.get('id');
    
    if (!sessionId) {
      return new Response('ID de sessão não fornecido', { status: 400 });
    }
    
    // Excluir dados da sessão
    await this.state.storage.delete(sessionId);
    
    // Também excluir do KV, se existir
    if (this.env.SESSION_KV) {
      const sessionKey = `session:${sessionId}`;
      await this.env.SESSION_KV.delete(sessionKey);
    }
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}