import { createClient } from '@libsql/client';

// Função para inicializar o cliente Turso
export function initTursoClient() {
  const url = import.meta.env.TURSO_DB_URL || process.env.TURSO_DB_URL;
  const authToken = import.meta.env.TURSO_DB_TOKEN || process.env.TURSO_DB_TOKEN;
  
  if (!url) {
    console.error('Turso DB URL não definida');
    throw new Error('Turso DB URL não definida');
  }
  
  return createClient({
    url,
    authToken
  });
}

// Singleton para usar em toda a aplicação
let tursoClient: ReturnType<typeof createClient> | null = null;

export function getTursoClient() {
  if (!tursoClient) {
    tursoClient = initTursoClient();
  }
  return tursoClient;
}

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