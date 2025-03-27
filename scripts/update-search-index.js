/**
 * Script para atualizar o índice de busca
 * 
 * Este script pode ser executado manualmente ou como parte de um cron job
 * para manter o índice de busca atualizado.
 * 
 * Execute com: node scripts/update-search-index.js
 * 
 * É recomendado configurar a variável de ambiente SITE_URL caso esteja rodando em produção
 * Por exemplo: SITE_URL=https://seusite.com.br node scripts/update-search-index.js
 */

// Usando import dinâmico para node-fetch (ES Module)
import('node-fetch').then(({ default: fetch }) => {
  // Código de atualização do índice
  updateSearchIndex(fetch);
});

// URL do endpoint de atualização do índice
// Verifica se existe uma URL base definida, caso contrário usa localhost
const BASE_URL = process.env.SITE_URL || 'http://localhost:4321';
const UPDATE_INDEX_URL = `${BASE_URL}/api/search-update`;

// Token de autorização para o endpoint
const AUTH_TOKEN = process.env.SEARCH_INDEX_TOKEN || 'dev-token-search-index';

/**
 * Atualiza o índice de busca
 * @param {Function} fetchFn - Função fetch para fazer a requisição
 */
async function updateSearchIndex(fetchFn) {
  try {
    console.log('Iniciando atualização do índice de busca...');
    console.log(`URL da API: ${UPDATE_INDEX_URL}`);
    
    const response = await fetchFn(UPDATE_INDEX_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log(`Índice de busca atualizado com sucesso. ${data.productsIndexed} produtos indexados.`);
    } else {
      console.error('Falha ao atualizar índice de busca:', data.error);
    }
  } catch (error) {
    console.error('Erro ao atualizar índice de busca:', error);
  }
}