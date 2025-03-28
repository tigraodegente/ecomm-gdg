// Entrypoint para inicialização no Cloudflare
import { getTursoClient, executeMigration } from './db/turso-client';

export async function onRequest({ request, next }) {
  // Verificar se estamos rodando no ambiente Cloudflare
  const isCloudflare = typeof EdgeRuntime !== 'undefined';
  
  if (isCloudflare) {
    // Inicializar banco de dados e executar migrações
    try {
      await runMigrations();
      console.log('Migrations completed successfully');
    } catch (error) {
      console.error('Failed to run migrations:', error);
    }
  }
  
  // Continuar com a próxima etapa do pipeline de requisição
  return next();
}

async function runMigrations() {
  // Migrações base de autenticação
  const authMigrations = [
    // Tabela de usuários
    `CREATE TABLE IF NOT EXISTS User (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      emailVerified INTEGER,
      image TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );`,
    
    // Tabela de sessões
    `CREATE TABLE IF NOT EXISTS Session (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
    );`,
    
    // Tabela de credenciais
    `CREATE TABLE IF NOT EXISTS Credential (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      type TEXT NOT NULL,
      value TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
    );`,
    
    // Tabela de verificação
    `CREATE TABLE IF NOT EXISTS Verification (
      id TEXT PRIMARY KEY,
      userId TEXT,
      token TEXT NOT NULL UNIQUE,
      identifier TEXT NOT NULL,
      expires TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
    );`,
    
    // Índices para otimização
    `CREATE INDEX IF NOT EXISTS user_email_idx ON User(email);`,
    `CREATE INDEX IF NOT EXISTS session_user_idx ON Session(userId);`,
    `CREATE INDEX IF NOT EXISTS credential_user_idx ON Credential(userId);`,
    `CREATE INDEX IF NOT EXISTS verification_token_idx ON Verification(token);`
  ];
  
  // Executar migrações
  console.log('Running auth migrations');
  try {
    for (const migration of authMigrations) {
      await executeMigration(migration);
    }
    console.log('Auth migrations completed');
  } catch (error) {
    console.error('Error running auth migrations:', error);
    throw error;
  }
}