const Database = require('better-sqlite3');
const { sql } = require('drizzle-orm');

// Criar conexão com o banco de dados SQLite
const sqlite = new Database("./marketplace.db");

// Configurar o banco de dados para usar foreign keys
sqlite.pragma("foreign_keys = ON");

/**
 * Script para executar as migrações do banco de dados
 */
async function runMigrations() {
  try {
    console.log("Iniciando migrações...");
    
    // Criar tabelas principais em ordem para respeitar as relações

    // 1. Categorias (recursivo com parentId)
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        parent_id INTEGER,
        image_url TEXT,
        display_order INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_id) REFERENCES categories(id)
      )
    `);

    // 2. CIDs para Categorias
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS category_identifiers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL,
        cid TEXT NOT NULL UNIQUE,
        is_default INTEGER DEFAULT 0,
        language TEXT DEFAULT 'pt-BR',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories(id)
      )
    `);

    // 3. Tabela de Usuários (base do Better-auth)
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS User (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT,
        emailVerified INTEGER DEFAULT 0,
        image TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 4. Perfis de Usuários
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL UNIQUE,
        phone_number TEXT,
        cpf TEXT,
        date_of_birth TEXT,
        preferred_language TEXT DEFAULT 'pt-BR',
        newsletter_opt_in INTEGER DEFAULT 0,
        marketing_opt_in INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES User(id)
      )
    `);

    // 5. Vendedores/Lojistas
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS vendors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        shop_name TEXT NOT NULL,
        description TEXT,
        logo_url TEXT,
        banner_url TEXT,
        email TEXT NOT NULL,
        phone TEXT,
        website_url TEXT,
        commission_rate REAL DEFAULT 0,
        is_approved INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        approved_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES User(id)
      )
    `);

    console.log("Primeiras tabelas criadas com sucesso!");
    
    // Adicione mais tabelas conforme necessário...
    
    console.log("Migração concluída com sucesso!");
  } catch (error) {
    console.error("Erro durante o processo de migração:", error);
    process.exit(1);
  }
}

// Executar migrações
runMigrations().then(() => {
  console.log("Processo de migração finalizado!");
  process.exit(0);
});