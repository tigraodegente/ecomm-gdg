import { runMigrations } from "./config";

/**
 * Script para executar as migrações do banco de dados
 * Pode ser executado com: node -r esbuild-register src/db/migrate.ts
 */
async function main() {
  try {
    console.log("Iniciando processo de migração...");
    await runMigrations();
    console.log("Migração concluída com sucesso!");
    process.exit(0);
  } catch (error) {
    console.error("Erro durante o processo de migração:", error);
    process.exit(1);
  }
}

main();