import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";

// Criar conexão com o banco de dados SQLite
const sqlite = new Database("./marketplace.db");

// Configurar o banco de dados para usar foreign keys
sqlite.pragma("foreign_keys = ON");

// Criar instância do drizzle com o schema
export const db = drizzle(sqlite, { schema });

// Função helper para executar migrações
export async function runMigrations() {
  try {
    console.log("Iniciando migrações...");
    
    // Importar dinâmicamente a migration inicial
    const initialMigration = await import("./migrations/0000_initial_schema");
    
    // Executar a migração
    await initialMigration.up();
    
    console.log("Migrações concluídas com sucesso!");
  } catch (error) {
    console.error("Erro ao executar migrações:", error);
    throw error;
  }
}

// Função para popular dados iniciais
export async function seedInitialData() {
  // Esta função será implementada posteriormente
  console.log("Função para seed de dados iniciais será implementada em breve.");
}