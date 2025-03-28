# Otimização do Marketplace com Cloudflare

Este documento descreve a arquitetura e implementação das otimizações feitas para o marketplace e-commerce baseado no Freedom Stack usando a infraestrutura Cloudflare.

## Índice

1. [Arquitetura de Cache Distribuído](#1-arquitetura-de-cache-distribuído)
2. [Otimização de Endpoints Críticos](#2-otimização-de-endpoints-críticos)
3. [Sistema de Busca de Alta Performance](#3-sistema-de-busca-de-alta-performance)
4. [Renderização Otimizada de Páginas](#4-renderização-otimizada-de-páginas)
5. [Otimização de Assets e Mídia](#5-otimização-de-assets-e-mídia)
6. [Integração e Analytics](#6-integração-e-analytics)

## 1. Arquitetura de Cache Distribuído

A arquitetura de cache implementada opera em múltiplas camadas:

### Cache L1 (Browser)

Implementado via headers Cache-Control apropriados para cada tipo de conteúdo:

- **Recursos Estáticos** (CSS, JS, fontes): `Cache-Control: public, max-age=31536000, immutable`
- **Imagens**: `Cache-Control: public, max-age=604800` (1 semana)
- **Páginas HTML**: `Cache-Control: public, max-age=3600, stale-while-revalidate=86400` (1 hora com SWR de 1 dia)
- **APIs JSON**: `Cache-Control: public, max-age=60` (1 minuto)

### Cache L2 (Cloudflare Edge)

Utiliza a Cache API do Cloudflare para armazenar respostas completas:

- Implementado no middleware `cache.js` que gerencia chaves de cache
- Utiliza variação por cabeçalhos (Accept, Accept-Encoding)
- Suporta revalidação em background (stale-while-revalidate)
- Invalidação seletiva por padrões de URL

### Cache L3 (KV Storage)

Armazena dados estruturados para acesso rápido:

- **Índice de Busca**: Armazenado em KV e atualizado periodicamente
- **Produtos Populares**: Armazenados em KV com TTL de 1 hora
- **Resultados de Busca Comuns**: Cache com TTL dinâmico baseado na popularidade

### Sistema de Invalidação Inteligente

O sistema de invalidação opera em vários níveis:

- **Invalidação por Tag**: Agrupa conteúdo relacionado por tags (ex: `product:123`)
- **Invalidação por Dependência**: Mantém grafos de dependência para invalidação em cascata
- **Purge Seletivo**: Comandos `cf-purge` para URLs específicas durante deploys

### Exemplo de Uso

```javascript
// Middleware para gerenciar cache
export const onRequest = async (context, next) => {
  // Verificação de cache e estratégia baseada no path
  const cacheConfig = getCacheConfig(context.request.url);
  
  if (cacheConfig.cacheable) {
    // Aplicar estratégia de cache
    // ...
  }
  
  return next();
};
```

## 2. Otimização de Endpoints Críticos

### Workers para APIs Críticas

Os seguintes endpoints foram convertidos para Cloudflare Workers:

- **/api/search-products**: Worker otimizado com FlexSearch no edge
- **/api/cart**: Worker com Durable Objects para estado do carrinho
- **/api/product-data**: Worker com KV para dados de produtos frequentes

### Armazenamento KV

O KV é utilizado para:

- Cache de produtos e categorias
- Índice de busca distribuído
- Configurações dinâmicas da aplicação

### Cache API para Operações Complexas

Operações computacionalmente intensivas são cacheadas:

- Resultados de busca baseados em consultas frequentes
- Filtros de produtos pré-calculados
- Recomendações de produtos relacionados

### Exemplo de Implementação

```javascript
// Worker para API de busca
export default {
  async fetch(request, env, ctx) {
    // Extrair parâmetros de busca
    const url = new URL(request.url);
    const term = url.searchParams.get('q');
    
    // Verificar cache KV
    const cacheKey = `search:${term}`;
    const cached = await env.SEARCH_CACHE.get(cacheKey, {type: 'json'});
    if (cached) return jsonResponse(cached);
    
    // Buscar resultados usando FlexSearch
    const results = await searchWithFlexSearch(term, env);
    
    // Armazenar no cache com TTL
    await env.SEARCH_CACHE.put(cacheKey, JSON.stringify(results), {expirationTtl: 3600});
    
    return jsonResponse(results);
  }
};
```

## 3. Sistema de Busca de Alta Performance

### FlexSearch Otimizado

A implementação do FlexSearch foi adaptada para Cloudflare Workers:

- Índice principal armazenado em KV Storage
- Configuração otimizada para termos curtos e tolerância a erros
- Sistema avançado de scoring e relevância
- Sugestões de busca geradas no edge

### KV Storage para Índice

O índice é distribuído por categorias:

- `main`: Índice completo para busca geral
- `category:{id}`: Índices específicos por categoria
- `keywords`: Índice de palavras-chave e termos populares

### Atualização Automática do Índice

O índice é mantido atualizado através de:

- Cron triggers que executam a cada 6 horas
- Invalidação sob demanda quando produtos são atualizados
- Sistema de fallback para buscas sem cache de índice

### Exemplo de Implementação

```javascript
// Atualização do índice
export async function updateSearchIndex(env) {
  // Obter produtos atualizados
  const products = await getAllProducts(env);
  
  // Gerar índice FlexSearch
  const serializedIndex = generateFlexSearchIndex(products);
  
  // Armazenar no KV
  await env.SEARCH_INDEX.put('main', serializedIndex);
  
  // Armazenar índices por categoria
  // ...
  
  return { success: true, productsIndexed: products.length };
}
```

## 4. Renderização Otimizada de Páginas

### Configuração SSR/ISR

Configuração adaptada para otimização por tipo de página:

- **Páginas Estáticas**: Pré-renderizadas durante build
- **Páginas de Produto**: ISR com cache de 1 dia e revalidação a cada 1 hora
- **Páginas de Categoria**: ISR com cache de 2 horas
- **Páginas Dinâmicas** (carrinho, checkout): SSR puro sem cache

### Streaming HTML

Implementado para carregar o conteúdo crítico primeiro:

- Envia o `<head>` e CSS crítico imediatamente
- Depois envia o conteúdo principal da página
- Por último, scripts e conteúdo não crítico

### Detalhes de Implementação

```javascript
// Middleware para streaming HTML
export const onRequest = async (context, next) => {
  const response = await next();
  
  if (isHtmlResponse(response) && shouldEnableStreaming(context.request.url)) {
    return streamHtmlResponse(response, context);
  }
  
  return response;
};

// Função de streaming
async function streamHtmlResponse(response, context) {
  const html = await response.text();
  const { criticalHtml, nonCriticalHtml } = splitHtmlForStreaming(html);
  
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  
  // Enviar conteúdo crítico imediatamente
  writer.write(encoder.encode(criticalHtml));
  
  // Enviar conteúdo não crítico após um pequeno delay
  setTimeout(() => {
    writer.write(encoder.encode(nonCriticalHtml));
    writer.close();
  }, 10);
  
  return new Response(readable, {
    headers: response.headers
  });
}
```

## 5. Otimização de Assets e Mídia

### Image Optimization

Utiliza o serviço de otimização de imagens da Cloudflare:

- Imagens convertidas para WebP ou AVIF
- Redimensionamento automático baseado em tela
- Lazy loading inteligente
- Prevenção de Layout Shift com aspect ratio reservado

### Componente OptimizedImage

Componente Astro que encapsula todas as otimizações:

```astro
<OptimizedImage 
  src="/produtos/cadeira.jpg"
  alt="Cadeira ergonômica"
  widths={[400, 800, 1200]}
  sizes="(max-width: 768px) 100vw, 50vw"
  aspectRatio={1.5}
  eager={false}
  format="webp"
  quality={80}
/>
```

### Pipeline de Processamento

As imagens são processadas em múltiplos estágios:

1. Upload inicial para R2 Storage
2. Processamento sob demanda via Image Optimization
3. Cache no edge para tamanhos frequentemente solicitados

## 6. Integração e Analytics

### Edge Analytics

Coleta de métricas em tempo real:

- Core Web Vitals (LCP, FID, CLS)
- Tempo de resposta por região
- Taxa de cache hit/miss
- Utilização de KV e R2

### Monitoramento de Performance

Implementado via:

- Script de monitoramento de Core Web Vitals
- Workers para coleta e processamento de métricas
- KV para armazenamento de dados agregados

### Dashboard de Métricas

Fornece visualização em tempo real:

- Performance por região e dispositivo
- Tendências de Core Web Vitals
- Oportunidades de otimização
- Alertas para degradação de performance

### Exemplo de Implementação

```javascript
// Worker para coleta de métricas
export default {
  async fetch(request, env, ctx) {
    if (request.url.endsWith('/api/performance')) {
      // Coletar métricas do cliente
      const data = await request.json();
      
      // Armazenar no KV com contexto adicional
      await storePerformanceMetrics(data, request, env);
      
      return new Response(JSON.stringify({success: true}));
    }
    
    // Outras rotas...
  }
};
```

## Conclusão

A implementação dessas otimizações permite que o marketplace alcance:

- Tempo de carregamento de página abaixo de 2 segundos em dispositivos móveis
- Core Web Vitals excelentes (LCP < 2.5s, FID < 100ms, CLS < 0.1)
- Escalabilidade para milhares de usuários simultâneos
- Tempo de resposta de busca < 200ms
- Zero downtime durante implantações

A arquitetura baseada em Cloudflare proporciona um equilíbrio ideal entre performance, custo e manutenibilidade.

## Próximos Passos

- Implementar Durable Objects para sincronização de carrinho multi-dispositivo
- Expandir Workers KV para mais endpoints críticos
- Otimizar ainda mais o Stream HTML com carregamento parcial de componentes
- Melhorar a invalidação de cache baseada em padrões de uso