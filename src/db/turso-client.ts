import { createClient } from '@libsql/client';

// Função para inicializar o cliente Turso otimizado para Cloudflare
export function initTursoClient() {
  const url = import.meta.env.TURSO_DB_URL || process.env.TURSO_DB_URL;
  const authToken = import.meta.env.TURSO_DB_TOKEN || process.env.TURSO_DB_TOKEN;
  
  if (!url) {
    console.error('Turso DB URL não definida');
    throw new Error('Turso DB URL não definida');
  }
  
  return createClient({
    url,
    authToken,
    // Opções específicas para ambiente Cloudflare
    fetch: (globalThis.fetch as any),
    syncUrl: import.meta.env.TURSO_SYNC_URL || process.env.TURSO_SYNC_URL
  });
}

// Cache específico para ambientes edge (Cloudflare Workers)
// Não compartilhado entre requisições, mas persistente durante uma única requisição
const edgeRuntime = typeof EdgeRuntime !== 'undefined';
let requestScopedClient: ReturnType<typeof createClient> | null = null;

// Singleton para usar em toda a aplicação com suporte a edge
export function getTursoClient() {
  // Em ambientes edge, usamos uma instância por requisição
  if (edgeRuntime) {
    if (!requestScopedClient) {
      requestScopedClient = initTursoClient();
    }
    return requestScopedClient;
  }
  
  // Para ambientes não-edge, usamos um singleton global
  if (!globalTursoClient) {
    globalTursoClient = initTursoClient();
  }
  return globalTursoClient;
}

// Singleton global para ambientes não-edge
let globalTursoClient: ReturnType<typeof createClient> | null = null;

// Função para executar queries com retry para lidar com conectividade intermitente
export async function executeQuery<T>(
  query: string,
  params: any[] = [],
  retries = 3
): Promise<T> {
  const client = getTursoClient();
  
  try {
    const result = await client.execute({
      sql: query,
      args: params
    });
    
    return result as unknown as T;
  } catch (error) {
    if (retries > 0) {
      console.warn(`Erro ao executar query, tentando novamente (${retries} tentativas restantes):`, error);
      await new Promise(resolve => setTimeout(resolve, 200));
      return executeQuery(query, params, retries - 1);
    }
    
    console.error('Erro ao executar query:', error);
    throw error;
  }
}

// Função para fazer migrações
export async function executeMigration(sql: string) {
  const client = getTursoClient();
  
  try {
    await client.batch(sql.split(';').filter(stmt => stmt.trim()).map(stmt => ({
      sql: stmt + ';',
      args: []
    })));
    
    return { success: true };
  } catch (error) {
    console.error('Erro ao executar migração:', error);
    return { success: false, error };
  }
}