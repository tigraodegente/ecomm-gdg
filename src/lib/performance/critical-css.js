/**
 * critical-css.js
 * 
 * Utilitários para extrair e gerenciar CSS crítico para renderização inicial
 * Implementa uma estratégia de carregamento em duas fases:
 * 1. CSS crítico inline no <head> para conteúdo acima da dobra
 * 2. Carregamento assíncrono do CSS completo após o carregamento inicial
 */

/**
 * Extrair CSS crítico para uma página específica
 * Esta função é chamada durante o build para gerar o CSS crítico
 * 
 * @param {string} html - HTML da página para análise
 * @param {string} fullCss - CSS completo
 * @param {Object} options - Opções de extração
 * @returns {string} CSS crítico extraído
 */
export async function extractCriticalCSS(html, fullCss, options = {}) {
  // Esta função é um placeholder - será substituída pela implementação
  // real usando Critters ou outra biblioteca de extração de CSS crítico
  return `/* CSS crítico */
:root{--font-fallback:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;--font-body:system-ui,var(--font-fallback);--font-mono:ui-monospace,SFMono-Regular,SF Mono,Menlo,Consolas,Liberation Mono,monospace;--color-text:rgb(10,10,10);--color-bg:rgb(250,250,250)}body{font-family:var(--font-body);color:var(--color-text);background-color:var(--color-bg)}
  `;
}

/**
 * Gerar link para carregamento assíncrono do CSS completo
 * 
 * @param {string} cssUrl - URL do CSS completo
 * @returns {string} HTML para carregar o CSS assincronamente
 */
export function generateAsyncCSSLoader(cssUrl) {
  return `
<link rel="preload" href="${cssUrl}" as="style" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="${cssUrl}"></noscript>
  `.trim();
}

/**
 * Gerar CSS crítico para cada página e template principal
 * Isto é usado durante o build para preparar CSS otimizado
 * 
 * @param {Array<Object>} pages - Lista de páginas para processar
 * @param {Object} options - Opções de configuração
 * @returns {Object} Mapeamento de páginas para CSS crítico
 */
export async function generateCriticalCSSForPages(pages, options = {}) {
  // Placeholder - implementação real usará o Astro API para processar arquivos
  return {
    default: `/* CSS Crítico padrão */
body{margin:0;padding:0}header,main,footer{width:100%}.container{max-width:1280px;margin:0 auto;padding:0 1rem}.product-card{display:flex;flex-direction:column}`,
    
    home: `/* CSS Crítico para Home */
.hero{min-height:60vh;display:flex;align-items:center}.featured-products{margin:2rem 0}.product-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:1.5rem}`,
    
    product: `/* CSS Crítico para páginas de produto */
.product-detail{display:grid;grid-template-columns:1fr 1fr;gap:2rem}.product-gallery{position:relative}.product-info{padding:1rem 0}`,
    
    category: `/* CSS Crítico para páginas de categoria */
.category-header{margin-bottom:1.5rem}.filter-sidebar{width:280px}.product-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:1rem}`
  };
}

/**
 * Determinar qual CSS crítico usar para uma rota específica
 * 
 * @param {string} route - Rota da página
 * @param {Object} criticalCSSMap - Mapeamento de CSS crítico
 * @returns {string} CSS crítico para a rota
 */
export function getCriticalCSSForRoute(route, criticalCSSMap) {
  if (route === '/') return criticalCSSMap.home || criticalCSSMap.default;
  if (route.includes('/produto/')) return criticalCSSMap.product || criticalCSSMap.default;
  if (route.includes('/produtos/')) return criticalCSSMap.category || criticalCSSMap.default;
  
  // Fallback para CSS crítico padrão
  return criticalCSSMap.default;
}

/**
 * Inline CSS crítico em um documento HTML
 * 
 * @param {string} html - HTML da página
 * @param {string} criticalCSS - CSS crítico a ser injetado
 * @returns {string} HTML com CSS crítico injetado
 */
export function injectCriticalCSS(html, criticalCSS) {
  // Insere o CSS crítico antes do primeiro </head>
  return html.replace('</head>', `<style id="critical-css">${criticalCSS}</style></head>`);
}

/**
 * Converte CSS normal para versão assíncrona
 * 
 * @param {string} html - HTML da página
 * @returns {string} HTML com links CSS convertidos para assíncronos
 */
export function convertToAsyncCSS(html) {
  // Encontrar links CSS externos
  const cssLinkRegex = /<link rel="stylesheet" href="([^"]+)"[^>]*>/g;
  
  // Substituir por versões assíncronas
  return html.replace(cssLinkRegex, (match, cssUrl) => {
    return generateAsyncCSSLoader(cssUrl);
  });
}