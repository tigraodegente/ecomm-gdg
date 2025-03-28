/**
 * Serviço de Internacionalização
 * 
 * Fornece utilidades para internacionalização, formatação de moeda, datas
 * e suporte multilingue no site.
 */

// Definir moedas suportadas e suas configurações
export interface Currency {
  code: string;
  symbol: string;
  name: string;
  locale: string;
  decimalDigits: number;
  position: 'prefix' | 'suffix';
  thousandsSeparator: string;
  decimalSeparator: string;
  rate: number; // Taxa de conversão (1.0 para moeda base)
}

// Idiomas suportados
export interface Language {
  code: string;
  name: string;
  locale: string;
  hreflang: string;
  isDefault: boolean;
  rtl: boolean;
  dateFormat: string;
  timeFormat: string;
}

// Moedas suportadas
const currencies: Record<string, Currency> = {
  BRL: {
    code: 'BRL',
    symbol: 'R$',
    name: 'Real Brasileiro',
    locale: 'pt-BR',
    decimalDigits: 2,
    position: 'prefix',
    thousandsSeparator: '.',
    decimalSeparator: ',',
    rate: 1.0, // Moeda base (taxa 1.0)
  },
  USD: {
    code: 'USD',
    symbol: '$',
    name: 'Dólar Americano',
    locale: 'en-US',
    decimalDigits: 2,
    position: 'prefix',
    thousandsSeparator: ',',
    decimalSeparator: '.',
    rate: 0.18, // Taxa de conversão aproximada (5.5 BRL = 1 USD)
  },
  EUR: {
    code: 'EUR',
    symbol: '€',
    name: 'Euro',
    locale: 'en-IE',
    decimalDigits: 2,
    position: 'suffix',
    thousandsSeparator: ',',
    decimalSeparator: '.',
    rate: 0.16, // Taxa de conversão aproximada (6.2 BRL = 1 EUR)
  },
  PEN: {
    code: 'PEN',
    symbol: 'S/',
    name: 'Sol Peruano',
    locale: 'es-PE',
    decimalDigits: 2,
    position: 'prefix',
    thousandsSeparator: ',',
    decimalSeparator: '.',
    rate: 0.65, // Taxa de conversão aproximada
  },
  CLP: {
    code: 'CLP',
    symbol: '$',
    name: 'Peso Chileno',
    locale: 'es-CL',
    decimalDigits: 0, // Pesos chilenos não usam decimais
    position: 'prefix',
    thousandsSeparator: '.',
    decimalSeparator: ',',
    rate: 152.0, // Taxa de conversão aproximada
  }
};

// Idiomas suportados
const languages: Record<string, Language> = {
  'pt-BR': {
    code: 'pt-BR',
    name: 'Português (Brasil)',
    locale: 'pt-BR',
    hreflang: 'pt-br',
    isDefault: true,
    rtl: false,
    dateFormat: 'DD/MM/YYYY',
    timeFormat: 'HH:mm'
  },
  'es-CL': {
    code: 'es-CL',
    name: 'Español (Chile)',
    locale: 'es-CL',
    hreflang: 'es-cl',
    isDefault: false,
    rtl: false,
    dateFormat: 'DD-MM-YYYY',
    timeFormat: 'HH:mm'
  },
  'es-PE': {
    code: 'es-PE',
    name: 'Español (Perú)',
    locale: 'es-PE',
    hreflang: 'es-pe',
    isDefault: false,
    rtl: false,
    dateFormat: 'DD/MM/YYYY',
    timeFormat: 'HH:mm'
  },
  'en-US': {
    code: 'en-US',
    name: 'English (US)',
    locale: 'en-US',
    hreflang: 'en-us',
    isDefault: false,
    rtl: false,
    dateFormat: 'MM/DD/YYYY',
    timeFormat: 'hh:mm A'
  }
};

/**
 * Determina o idioma adequado com base no cabeçalho Accept-Language
 * @param acceptLanguage O cabeçalho Accept-Language
 * @returns O código do idioma a ser usado
 */
export function determineLanguage(acceptLanguage?: string): string {
  if (!acceptLanguage) return 'pt-BR'; // Idioma padrão
  
  const langHeader = acceptLanguage.toLowerCase();
  
  if (langHeader.includes('pt-br') || langHeader.includes('pt')) {
    return 'pt-BR';
  } else if (langHeader.includes('es-cl')) {
    return 'es-CL';
  } else if (langHeader.includes('es-pe')) {
    return 'es-PE';
  } else if (langHeader.includes('es')) {
    // Para outros espanhóis, usar o idioma do Perú como padrão
    return 'es-PE';
  } else if (langHeader.includes('en')) {
    return 'en-US';
  }
  
  // Padrão
  return 'pt-BR';
}

/**
 * Obtém a informação de idioma pelo código
 * @param langCode Código do idioma
 * @returns Dados do idioma
 */
export function getLanguage(langCode: string): Language {
  return languages[langCode] || languages['pt-BR'];
}

/**
 * Obtém a moeda a ser usada com base no idioma
 * @param langCode Código do idioma
 * @returns Dados da moeda
 */
export function getCurrencyForLanguage(langCode: string): Currency {
  switch (langCode) {
    case 'pt-BR':
      return currencies.BRL;
    case 'es-CL':
      return currencies.CLP;
    case 'es-PE':
      return currencies.PEN;
    case 'en-US':
      return currencies.USD;
    default:
      return currencies.BRL;
  }
}

/**
 * Formata um preço usando as configurações de moeda especificadas
 * @param price Preço a ser formatado
 * @param currencyCode Código da moeda a ser usada
 * @returns Preço formatado com símbolo da moeda
 */
export function formatPrice(price: number, currencyCode: string = 'BRL'): string {
  const currency = currencies[currencyCode] || currencies.BRL;
  
  // Converter o preço para a moeda alvo
  let convertedPrice = price;
  if (currencyCode !== 'BRL') {
    convertedPrice = price * currency.rate;
  }
  
  // Formatação nativa usando Intl.NumberFormat
  const formatted = new Intl.NumberFormat(currency.locale, {
    style: 'currency',
    currency: currency.code,
    minimumFractionDigits: currency.decimalDigits,
    maximumFractionDigits: currency.decimalDigits
  }).format(convertedPrice);
  
  return formatted;
}

/**
 * Formata uma data usando o formato especificado para o idioma
 * @param date Data a ser formatada
 * @param langCode Código do idioma
 * @returns Data formatada
 */
export function formatDate(date: Date, langCode: string = 'pt-BR'): string {
  const language = languages[langCode] || languages['pt-BR'];
  
  return new Intl.DateTimeFormat(language.locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

/**
 * Formata um número usando as configurações regionais
 * @param num Número a ser formatado
 * @param langCode Código do idioma
 * @param decimals Casas decimais
 * @returns Número formatado
 */
export function formatNumber(num: number, langCode: string = 'pt-BR', decimals: number = 2): string {
  const language = languages[langCode] || languages['pt-BR'];
  
  return new Intl.NumberFormat(language.locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(num);
}

/**
 * Calcula o percentual de desconto entre dois preços
 * @param originalPrice Preço original (maior)
 * @param discountedPrice Preço com desconto (menor)
 * @returns Percentual de desconto ou 0 se não houver desconto
 */
export function calculateDiscount(originalPrice: number, discountedPrice: number): number {
  if (!originalPrice || !discountedPrice || originalPrice <= discountedPrice) {
    return 0;
  }
  
  return Math.round(((originalPrice - discountedPrice) / originalPrice) * 100);
}

/**
 * Obtém a URL alternativa para um idioma específico
 * @param currentPath Caminho atual
 * @param targetLang Idioma alvo
 * @returns URL para o idioma alvo
 */
export function getAlternateUrl(currentPath: string, targetLang: string): string {
  // Verificar se já tem um prefixo de idioma no URL
  const pathParts = currentPath.split('/').filter(Boolean);
  
  // Se o caminho já tem um código de idioma, removê-lo
  Object.keys(languages).forEach(langCode => {
    const code = langCode.toLowerCase();
    if (pathParts[0] === code) {
      pathParts.shift();
    }
  });
  
  // Se o idioma alvo for o padrão e não temos paths específicos,
  // não adicionar prefixo de idioma
  if (languages[targetLang]?.isDefault) {
    return `/${pathParts.join('/')}`;
  }
  
  // Adicionar o novo código de idioma
  return `/${targetLang.toLowerCase()}/${pathParts.join('/')}`;
}

/**
 * Obtém todos os links alternativos para uma página
 * @param currentPath Caminho atual
 * @returns Array de alternativas para hreflang
 */
export function getAllAlternateUrls(currentPath: string): Array<{lang: string, url: string, hreflang: string}> {
  return Object.values(languages).map(lang => ({
    lang: lang.code,
    url: getAlternateUrl(currentPath, lang.code),
    hreflang: lang.hreflang
  }));
}

/**
 * Verifica se um caminho contém um código de idioma válido
 * @param path Caminho a ser verificado
 * @returns Se o caminho contém um código de idioma válido
 */
export function hasLanguagePrefix(path: string): boolean {
  const firstPart = path.split('/')[1]?.toLowerCase();
  return Object.keys(languages).some(langCode => 
    langCode.toLowerCase() === firstPart || 
    langCode.split('-')[0] === firstPart
  );
}

/**
 * Extrai o código de idioma de um caminho
 * @param path Caminho com código de idioma
 * @returns Código do idioma ou undefined se não encontrado
 */
export function extractLanguageFromPath(path: string): string | undefined {
  const firstPart = path.split('/')[1]?.toLowerCase();
  
  // Verificar correspondência exata
  for (const langCode of Object.keys(languages)) {
    if (langCode.toLowerCase() === firstPart) {
      return langCode;
    }
  }
  
  // Verificar correspondência parcial (apenas a primeira parte do código)
  for (const langCode of Object.keys(languages)) {
    if (langCode.split('-')[0] === firstPart) {
      return langCode;
    }
  }
  
  return undefined;
}

/**
 * Middleware para determinar e definir o idioma com base na solicitação
 * @param request Solicitação HTTP
 * @param locals Contexto local do Astro
 * @returns Código do idioma determinado
 */
export function setupLanguage(request: Request, locals: Record<string, any>): string {
  // Obter o idioma das preferências do navegador
  const acceptLanguage = request.headers.get('accept-language');
  const preferredLang = determineLanguage(acceptLanguage);
  
  // Verificar se há um idioma no URL
  const url = new URL(request.url);
  const pathLang = extractLanguageFromPath(url.pathname);
  
  // Prioridade: 1. URL, 2. Cookie, 3. Navegador
  const cookieLang = locals.cookies?.get('lang')?.value;
  const lang = pathLang || cookieLang || preferredLang;
  
  // Armazenar o idioma no contexto local
  locals.lang = lang;
  
  // Definir o cookie se não existir ou for diferente
  if (!cookieLang || cookieLang !== lang) {
    locals.cookies?.set('lang', lang, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 ano
      httpOnly: true,
      secure: url.protocol === 'https:'
    });
  }
  
  return lang;
}

/**
 * Obtém o texto traduzido para um determinado idioma
 * @param key Chave da mensagem
 * @param lang Código do idioma
 * @param replacements Substituições para placeholders
 * @returns Texto traduzido
 */
export function t(key: string, lang: string = 'pt-BR', replacements: Record<string, string> = {}): string {
  // Implementação simplificada - em produção, carregar traduções de um arquivo JSON
  const translations: Record<string, Record<string, string>> = {
    'pt-BR': {
      'hello': 'Olá',
      'welcome': 'Bem-vindo(a) {name}',
      'cart': 'Carrinho',
      'products': 'Produtos',
      'search': 'Buscar'
    },
    'es-PE': {
      'hello': 'Hola',
      'welcome': 'Bienvenido(a) {name}',
      'cart': 'Carrito',
      'products': 'Productos',
      'search': 'Buscar'
    },
    'es-CL': {
      'hello': 'Hola',
      'welcome': 'Bienvenido(a) {name}',
      'cart': 'Carrito',
      'products': 'Productos',
      'search': 'Buscar'
    },
    'en-US': {
      'hello': 'Hello',
      'welcome': 'Welcome {name}',
      'cart': 'Cart',
      'products': 'Products',
      'search': 'Search'
    }
  };
  
  // Obter a tradução para o idioma especificado ou usar o padrão
  const langTranslations = translations[lang] || translations['pt-BR'];
  let text = langTranslations[key] || key;
  
  // Aplicar substituições
  Object.entries(replacements).forEach(([placeholder, value]) => {
    text = text.replace(`{${placeholder}}`, value);
  });
  
  return text;
}

// Exportar todas as moedas e idiomas suportados
export {
  currencies,
  languages
};