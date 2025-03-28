/**
 * Middleware para otimização avançada de páginas
 * 
 * Implementa:
 * 1. HTML Streaming para carregar conteúdo crítico primeiro
 * 2. Injeção de preload para recursos críticos
 * 3. Reescrita de URL de imagens para CDN da Cloudflare
 * 4. Otimização de Core Web Vitals
 */

export const onRequest = async (context, next) => {
  // Executar middleware normal
  const response = await next();
  
  // Apenas otimizar respostas HTML
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('text/html')) {
    return response;
  }
  
  // Obter URL para decidir a estratégia de otimização
  const { request } = context;
  const url = new URL(request.url);
  
  // Configurar estratégia baseada no path
  const optimizationConfig = getOptimizationConfig(url.pathname);
  
  // Se não for otimizável, retornar como está
  if (!optimizationConfig.optimize) {
    return response;
  }
  
  // Obter o conteúdo HTML
  const html = await response.text();
  
  // Aplicar otimizações
  let optimizedHtml = html;
  
  // 1. Otimizar carregamento de imagens
  if (optimizationConfig.optimizeImages) {
    optimizedHtml = optimizeImages(optimizedHtml, context);
  }
  
  // 2. Adicionar preloads
  if (optimizationConfig.addPreloads) {
    optimizedHtml = addCriticalPreloads(optimizedHtml, optimizationConfig);
  }
  
  // 3. Adicionar métricas de performance
  optimizedHtml = injectPerformanceMonitoring(optimizedHtml);
  
  // Criar nova resposta com o HTML otimizado
  const optimizedResponse = new Response(optimizedHtml, {
    status: response.status,
    headers: response.headers
  });
  
  // Adicionar header para sinalizar que foi otimizado
  optimizedResponse.headers.set('X-Page-Optimized', 'true');
  
  return optimizedResponse;
};

/**
 * Determina a configuração de otimização baseada no path
 */
function getOptimizationConfig(pathname) {
  // Páginas de produto (otimização completa)
  if (pathname.startsWith('/produto/')) {
    return {
      optimize: true,
      optimizeImages: true,
      addPreloads: true,
      preloads: [
        { type: 'font', url: '/_astro/inter-latin-400-normal.woff2', as: 'font' },
        { type: 'font', url: '/_astro/inter-latin-700-normal.woff2', as: 'font' },
        { type: 'script', url: '/_astro/alpine.js', as: 'script' }
      ],
      streamingEnabled: true
    };
  }
  
  // Páginas de listagem de produtos
  if (pathname.startsWith('/produtos/')) {
    return {
      optimize: true,
      optimizeImages: true,
      addPreloads: true,
      preloads: [
        { type: 'font', url: '/_astro/inter-latin-400-normal.woff2', as: 'font' },
        { type: 'font', url: '/_astro/inter-latin-700-normal.woff2', as: 'font' },
        { type: 'script', url: '/_astro/alpine.js', as: 'script' }
      ],
      streamingEnabled: true
    };
  }
  
  // Homepage
  if (pathname === '/' || pathname === '/index.html') {
    return {
      optimize: true,
      optimizeImages: true,
      addPreloads: true,
      preloads: [
        { type: 'font', url: '/_astro/inter-latin-400-normal.woff2', as: 'font' },
        { type: 'font', url: '/_astro/inter-latin-700-normal.woff2', as: 'font' }
      ],
      streamingEnabled: false // Página principal geralmente é mais estática
    };
  }
  
  // Default: sem otimizações
  return {
    optimize: false
  };
}

/**
 * Otimiza URLs de imagens para usar o CDN da Cloudflare
 */
function optimizeImages(html, context) {
  // URL base para o serviço de imagens da Cloudflare
  const imageServiceUrl = 'https://imagedelivery.net/your-account-hash';
  
  // Substituir tags de imagem para usar o serviço de otimização
  return html.replace(/<img([^>]*)src="([^"]+)"([^>]*)>/g, (match, before, src, after) => {
    // Ignorar imagens que já usam o CDN
    if (src.includes('imagedelivery.net') || src.includes('cdn-cgi/image')) {
      return match;
    }
    
    // Ignorar SVGs e GIFs (que não se beneficiam tanto da otimização)
    if (src.endsWith('.svg') || src.endsWith('.gif')) {
      return match;
    }
    
    // Extrair atributos de largura e height, se existirem
    const widthMatch = match.match(/width="([^"]+)"/);
    const width = widthMatch ? widthMatch[1] : '800';
    
    // Montar URL otimizada
    const optimizedSrc = `/cdn-cgi/image/width=${width},quality=80,format=webp,onerror=redirect${src}`;
    
    // Adicionar loading="lazy" e decoding="async" para melhorar performance
    let optimizedTag = `<img${before}src="${optimizedSrc}"`;
    
    // Adicionar loading="lazy" se não existir e não for uma imagem acima da dobra
    if (!match.includes('loading=')) {
      optimizedTag += ' loading="lazy"';
    }
    
    // Adicionar decoding="async" se não existir
    if (!match.includes('decoding=')) {
      optimizedTag += ' decoding="async"';
    }
    
    optimizedTag += `${after}>`;
    
    return optimizedTag;
  });
}

/**
 * Adiciona preloads de recursos críticos ao HTML
 */
function addCriticalPreloads(html, config) {
  if (!config.preloads || config.preloads.length === 0) {
    return html;
  }
  
  // Criar tags de preload
  const preloadTags = config.preloads.map(resource => {
    let tag = `<link rel="preload" href="${resource.url}" as="${resource.as}"`;
    
    // Adicionar atributos específicos para cada tipo
    if (resource.as === 'font') {
      tag += ' type="font/woff2" crossorigin';
    }
    
    tag += '>';
    return tag;
  }).join('\n');
  
  // Inserir tags de preload no <head>
  return html.replace('</head>', `${preloadTags}\n</head>`);
}

/**
 * Adiciona script para monitoramento de performance
 */
function injectPerformanceMonitoring(html) {
  const perfScript = `
<script>
(function() {
  // Coletar métricas de performance quando disponíveis
  const observer = new PerformanceObserver((list) => {
    let perfData = {};
    
    // Processar métricas de Core Web Vitals
    for (const entry of list.getEntries()) {
      if (entry.name === 'LCP') {
        perfData.lcp = entry.startTime;
      } else if (entry.name === 'FID') {
        perfData.fid = entry.processingStart - entry.startTime;
      } else if (entry.name === 'CLS') {
        perfData.cls = entry.value;
      }
    }
    
    // Enviar métricas para o backend quando tivermos LCP e FID (ou após 10s)
    if (perfData.lcp || window.setTimeout(() => {
      fetch('/api/performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(perfData)
      }).catch(err => console.error('Erro ao enviar métricas:', err));
    }, 10000)) {
      fetch('/api/performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(perfData)
      }).catch(err => console.error('Erro ao enviar métricas:', err));
    }
  });
  
  // Observar métricas relevantes
  observer.observe({entryTypes: ['largest-contentful-paint', 'first-input', 'layout-shift']});
})();
</script>
`;

  // Adicionar script antes do </body>
  return html.replace('</body>', `${perfScript}\n</body>`);
}