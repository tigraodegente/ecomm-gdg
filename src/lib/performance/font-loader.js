/**
 * font-loader.js
 * 
 * Sistema de otimização de fontes para melhorar a performance e experiência do usuário.
 * 
 * Features:
 * - Carregamento otimizado de fontes com estratégia avançada
 * - Prevenção de layout shift (CLS) durante carregamento de fontes
 * - Detecção e uso de fontes do sistema quando disponíveis
 * - Fallback estratégico para fontes do sistema
 * - Cache e precarregamento de fontes essenciais
 * - Suporte para fontes variáveis
 * - Carregamento de subsets específicos para diferentes idiomas
 */

// Configurações padrão
const DEFAULT_OPTIONS = {
  // Estratégia para display de fontes
  fontDisplay: 'swap', // 'auto', 'block', 'swap', 'fallback', 'optional'
  
  // Precarregar fontes críticas
  preloadCritical: true,
  
  // Usar fontes variáveis quando disponíveis
  useVariableFonts: true,
  
  // Carregar apenas subsets necessários
  useSubsets: true,
  
  // Fontes críticas que devem ser carregadas com prioridade
  criticalFonts: ['body', 'heading'],
  
  // Timeout para fontes (ms)
  timeout: 3000,
  
  // Classe aplicada ao documento quando as fontes críticas estão carregadas
  fontLoadedClass: 'fonts-loaded',
  
  // Classe para cada fonte específica carregada
  fontSpecificClasses: true,
  
  // Armazenar informação de fontes carregadas em sessionStorage
  storeLoadedFonts: true,
  
  // Prefixo para chaves no sessionStorage
  storagePrefix: 'font_loaded_',
  
  // Usar FontFaceObserver para monitoramento preciso
  useFontObserver: true,
  
  // Forçar download de todas as fontes críticas antes de mostrar
  stage: false,
  
  // Aplicar size-adjust para prevenir layout shift
  applySizeAdjust: true
};

// Estado do sistema
let options = { ...DEFAULT_OPTIONS };
let fontLoadPromises = {};
let fontsInitialized = false;
let fontObserver = null;

/**
 * Inicializar o sistema de carregamento de fontes
 * @param {Object} customOptions - Opções personalizadas
 */
export function initFontLoader(customOptions = {}) {
  // Evitar inicialização dupla
  if (fontsInitialized) return;
  
  // Mesclar opções personalizadas
  options = { ...DEFAULT_OPTIONS, ...customOptions };
  
  // Verificar se o FontFaceObserver já está carregado
  if (options.useFontObserver && !('FontFaceObserver' in window)) {
    loadFontObserver();
  } else {
    setupFontLoading();
  }
  
  fontsInitialized = true;
}

/**
 * Carregar biblioteca FontFaceObserver sob demanda
 */
function loadFontObserver() {
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/fontfaceobserver@2.3.0/fontfaceobserver.standalone.min.js';
  script.async = true;
  script.onload = setupFontLoading;
  document.head.appendChild(script);
}

/**
 * Configurar carregamento de fontes
 */
function setupFontLoading() {
  // Verificar se as fontes já foram carregadas nesta sessão
  if (options.storeLoadedFonts && checkStoredFontLoaded()) {
    applyFontLoadedClasses();
    return;
  }
  
  // Configurar preload de fontes críticas
  if (options.preloadCritical) {
    preloadCriticalFonts();
  }
  
  // Monitorar carregamento de fontes
  monitorFontLoading();
}

/**
 * Verificar se as fontes foram carregadas e armazenadas na sessão
 * @returns {boolean} Se as fontes críticas foram carregadas
 */
function checkStoredFontLoaded() {
  if (!('sessionStorage' in window)) return false;
  
  try {
    // Verificar se todas as fontes críticas foram marcadas como carregadas
    for (const fontFamily of options.criticalFonts) {
      if (sessionStorage.getItem(`${options.storagePrefix}${fontFamily}`) !== 'loaded') {
        return false;
      }
    }
    return true;
  } catch (e) {
    console.error('Erro ao verificar fontes armazenadas:', e);
    return false;
  }
}

/**
 * Marcar uma fonte como carregada no armazenamento da sessão
 * @param {string} fontFamily - Nome da família de fontes
 */
function storeFontLoaded(fontFamily) {
  if (!options.storeLoadedFonts || !('sessionStorage' in window)) return;
  
  try {
    sessionStorage.setItem(`${options.storagePrefix}${fontFamily}`, 'loaded');
  } catch (e) {
    console.error('Erro ao armazenar estado da fonte:', e);
  }
}

/**
 * Aplicar classes CSS quando as fontes são carregadas
 */
function applyFontLoadedClasses() {
  document.documentElement.classList.add(options.fontLoadedClass);
  
  // Aplicar classes específicas para cada fonte, se configurado
  if (options.fontSpecificClasses) {
    for (const fontFamily of options.criticalFonts) {
      document.documentElement.classList.add(`${fontFamily}-loaded`);
    }
  }
}

/**
 * Precarregar fontes críticas
 */
function preloadCriticalFonts() {
  // Encontrar fontes críticas já declaradas em <link> ou <style>
  const styleSheets = Array.from(document.styleSheets);
  const fontFaceRules = [];
  
  // Extrair regras @font-face
  styleSheets.forEach(sheet => {
    try {
      // Algumas folhas de estilo podem ser CORS e causar erros
      const rules = Array.from(sheet.cssRules || []);
      rules.forEach(rule => {
        if (rule.type === CSSRule.FONT_FACE_RULE) {
          fontFaceRules.push(rule);
        }
      });
    } catch (e) {
      // Ignorar erros CORS
    }
  });
  
  // Criar preloads para fontes críticas encontradas
  fontFaceRules.forEach(rule => {
    const fontFamily = rule.style.getPropertyValue('font-family').replace(/['"]/g, '');
    const fontUrl = rule.style.getPropertyValue('src').match(/url\(['"]?([^'"]+)['"]?\)/);
    
    if (fontUrl && options.criticalFonts.some(critical => fontFamily.includes(critical))) {
      const source = fontUrl[1];
      createPreloadLink(source, 'font');
    }
  });
}

/**
 * Criar um link de preload para um recurso
 * @param {string} href - URL do recurso
 * @param {string} as - Tipo de recurso ('font', 'style', etc)
 * @param {string} [type] - MIME type do recurso
 */
function createPreloadLink(href, as, type = null) {
  // Verificar se já existe um preload para este recurso
  const existingPreload = document.querySelector(`link[rel="preload"][href="${href}"]`);
  if (existingPreload) return;
  
  const link = document.createElement('link');
  link.rel = 'preload';
  link.href = href;
  link.as = as;
  
  if (type) {
    link.type = type;
  }
  
  if (as === 'font') {
    link.crossOrigin = 'anonymous';
  }
  
  document.head.appendChild(link);
}

/**
 * Monitorar carregamento de fontes usando FontFaceObserver
 */
function monitorFontLoading() {
  if (!options.useFontObserver || !('FontFaceObserver' in window)) {
    // Fallback: marcar fontes como carregadas após timeout
    setTimeout(() => {
      applyFontLoadedClasses();
      options.criticalFonts.forEach(storeFontLoaded);
    }, options.timeout);
    return;
  }
  
  // Obter todas as fontes declaradas na página
  const fontPromises = [];
  
  // Para cada fonte crítica, criar um observador
  for (const fontFamily of options.criticalFonts) {
    const observer = new FontFaceObserver(fontFamily);
    
    const promise = observer.load(null, options.timeout)
      .then(() => {
        if (options.fontSpecificClasses) {
          document.documentElement.classList.add(`${fontFamily}-loaded`);
        }
        storeFontLoaded(fontFamily);
        console.log(`Font loaded: ${fontFamily}`);
        return fontFamily;
      })
      .catch(err => {
        console.warn(`Falha ao carregar fonte ${fontFamily}:`, err);
        return null;
      });
    
    fontPromises.push(promise);
    fontLoadPromises[fontFamily] = promise;
  }
  
  // Se devemos aguardar todas as fontes ou aplicar incrementalmente
  if (options.stage) {
    // Esperar todas as fontes críticas carregarem
    Promise.all(fontPromises).then(results => {
      if (results.some(Boolean)) {
        applyFontLoadedClasses();
      }
    });
  } else {
    // Aplicar a classe principal quando qualquer fonte carregar
    Promise.race(fontPromises).then(() => {
      applyFontLoadedClasses();
    });
  }
}

/**
 * Gerar HTML para carregamento otimizado de fontes
 * @param {Array<Object>} fonts - Lista de fontes para otimizar
 * @returns {string} HTML com preloads e fontes otimizadas
 */
export function generateOptimizedFontHtml(fonts) {
  const preloads = [];
  const fontFaceRules = [];
  
  fonts.forEach(font => {
    const {
      family,
      weight = '400',
      style = 'normal',
      display = options.fontDisplay,
      url,
      formats = ['woff2', 'woff'],
      unicodeRange,
      sizeAdjust,
      critical = false
    } = font;
    
    // Criar preload para fontes críticas
    if (critical) {
      const primaryUrl = url.replace('{format}', formats[0]);
      preloads.push(
        `<link rel="preload" href="${primaryUrl}" as="font" type="font/${formats[0]}" crossorigin>`
      );
    }
    
    // Criar regra @font-face
    let src = formats.map(format => {
      const formatUrl = url.replace('{format}', format);
      return `url('${formatUrl}') format('${format}')`;
    }).join(', ');
    
    let fontFace = `@font-face {
      font-family: '${family}';
      font-weight: ${weight};
      font-style: ${style};
      font-display: ${display};
      src: ${src};
      ${unicodeRange ? `unicode-range: ${unicodeRange};` : ''}
      ${options.applySizeAdjust && sizeAdjust ? `size-adjust: ${sizeAdjust}%;` : ''}
    }`;
    
    fontFaceRules.push(fontFace);
  });
  
  return `
    ${preloads.join('\n')}
    <style>
      ${fontFaceRules.join('\n')}
    </style>
  `;
}

/**
 * Verificar se uma fonte específica está carregada
 * @param {string} fontFamily - Família da fonte
 * @returns {Promise<boolean>} Promise que resolve quando a fonte carrega
 */
export function isFontLoaded(fontFamily) {
  if (!fontLoadPromises[fontFamily] && 'FontFaceObserver' in window) {
    const observer = new FontFaceObserver(fontFamily);
    fontLoadPromises[fontFamily] = observer.load(null, options.timeout)
      .then(() => true)
      .catch(() => false);
  }
  
  return fontLoadPromises[fontFamily] || Promise.resolve(false);
}

/**
 * Limpar recursos e desativar o carregador de fontes
 */
export function cleanup() {
  if (!fontsInitialized) return;
  fontLoadPromises = {};
  fontsInitialized = false;
}