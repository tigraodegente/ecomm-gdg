# Search Worker: Otimização da Busca com FlexSearch no Edge

## Visão Geral

O Search Worker implementa um sistema avançado de busca utilizando FlexSearch diretamente no edge da Cloudflare, proporcionando uma experiência de busca extremamente rápida e robusta para aplicações e-commerce.

### Principais Recursos

- **Busca no Edge**: Processamento completo da busca com FlexSearch no edge
- **Cache Multi-nível**: Sistema inteligente de cache para resultados recorrentes
- **Correção Ortográfica**: Sugestões inteligentes para termos mal digitados
- **Tokenização Avançada**: Suporte otimizado para termos curtos (como "kit")
- **Padrão Stale-While-Revalidate**: Alta performance mesmo durante atualizações
- **Métricas Detalhadas**: Sistema completo de analytics para otimização

## Funcionamento

O Search Worker fornece endpoints otimizados para:
1. Busca de produtos com filtros e paginação
2. Obtenção e armazenamento de índice para busca
3. Sugestões de busca em tempo real
4. Métricas e analytics para otimização contínua

### Endpoints Disponíveis

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/search-products` | GET | Busca de produtos com suporte a filtros e paginação |
| `/api/searchindex` | GET | Obtém índice de busca para uso no cliente |
| `/api/search-update` | POST | Atualiza o índice de busca (requer autenticação) |
| `/api/search/metrics` | GET | Fornece métricas sobre a performance da busca |
| `/api/search/suggest` | GET | Gera sugestões de autocompletar para um termo |

## Arquitetura

O sistema utiliza uma arquitetura de múltiplas camadas para otimizar a busca:

1. **Camada de Cache**: Armazena resultados de buscas frequentes com TTL dinâmico
2. **Camada de Processamento**: Utiliza FlexSearch para processamento avançado de consultas
3. **Camada de Índice**: Mantém um índice otimizado para consultas rápidas
4. **Camada de Métricas**: Coleta e analisa dados para otimização contínua

## Recursos Avançados

### Cache Inteligente com Stale-While-Revalidate

O worker implementa o padrão stale-while-revalidate para máxima performance:

1. Retorna resultados do cache imediatamente
2. Verifica se o cache está "velho" (além de 75% do TTL)
3. Se estiver velho, inicia revalidação em background
4. Cliente recebe resposta rápida mesmo durante atualizações

### TTL Dinâmico

Os tempos de expiração do cache são determinados com base em múltiplos fatores:

- **Comprimento do termo**: Termos mais específicos têm TTL mais longo
- **Popularidade da busca**: Termos populares recebem tratamento especial
- **Complexidade dos filtros**: Buscas mais específicas têm cache mais duradouro

### Warm-up Inteligente

O sistema analisa automaticamente os padrões de busca e:

1. Identifica os termos mais populares
2. Pré-aquece o cache para esses termos
3. Estende o TTL para termos frequentemente buscados

### Correção Ortográfica e Sugestões

O worker fornece sugestões inteligentes usando:

1. **Correção ortográfica**: Detecta erros de digitação com comparação de similaridade
2. **Sugestões populares**: Recomenda termos populares relacionados
3. **Autocompletar**: Gera sugestões baseadas no índice de produtos

## Parâmetros de Configuração

O Search Worker requer as seguintes configurações:

1. **KV Namespaces**:
   - `SEARCH_KV`: Armazena índice e resultados de busca
   - `SEARCH_METRICS`: Armazena métricas e dados de analytics

2. **Variáveis de Ambiente**:
   - `SEARCH_INDEX_TOKEN`: Token para autenticação de operações protegidas

## Uso da API

### Busca de Produtos

```
GET /api/search-products?q=berço&page=1&limit=20&category=Berços&minPrice=100&maxPrice=500&sort=price_asc
```

Parâmetros:
- `q`: Termo de busca
- `page`: Número da página (padrão: 1)
- `limit`: Itens por página (padrão: 20)
- `category`: Filtro por categoria
- `minPrice`: Preço mínimo
- `maxPrice`: Preço máximo
- `sort`: Ordenação (`relevance`, `price_asc`, `price_desc`, `name_asc`, `name_desc`)

### Atualização do Índice

```
POST /api/search-update
Authorization: Bearer <token>
Content-Type: application/json

{
  "incremental": true,
  "products": [
    {
      "id": "123",
      "name": "Berço Montessoriano",
      "description": "Berço em madeira natural",
      "price": 899.90,
      "compare_at_price": 999.90,
      "mainImage": "https://example.com/berco.jpg",
      "slug": "berco-montessoriano",
      "vendor_name": "Móveis Infantis",
      "category_name": "Berços",
      "tags": ["montessoriano", "madeira", "natural"]
    }
  ]
}
```

Parâmetros:
- `incremental`: Se true, atualiza produtos existentes sem recriar todo o índice
- `products`: Array de produtos para indexar

### Sugestões de Busca

```
GET /api/search/suggest?q=kit&limit=5
```

Parâmetros:
- `q`: Termo parcial para autocompletar
- `limit`: Número máximo de sugestões (padrão: 5)

### Métricas de Busca

```
GET /api/search/metrics?period=7d
Authorization: Bearer <token>
```

Parâmetros:
- `period`: Período para análise (`24h`, `7d`, `30d`)

## Métricas Disponíveis

O endpoint de métricas fornece dados detalhados:

1. **Estatísticas de Busca**:
   - Total de buscas
   - Termos únicos buscados
   - Termos mais populares

2. **Performance de Cache**:
   - Hit rate geral e por tipo
   - Hits e misses por período
   - Tempo médio de resposta

3. **Termos Problemáticos**:
   - Buscas sem resultados
   - Termos frequentemente corrigidos

## Otimização de Implementação

### Para Melhorar a Performance

1. **Índice Otimizado**:
   - Mantenha o índice atualizado regularmente
   - Use atualizações incrementais para mudanças frequentes
   - Inclua termos relacionados e sinônimos no campo searchData

2. **Cache Eficiente**:
   - Monitore o hit rate do cache e ajuste TTLs se necessário
   - Configure warm-ups para horários de pico
   - Revise periodicamente os termos populares

### Para Melhorar a Relevância

1. **Dados Enriquecidos**:
   - Inclua mais contexto no campo searchData
   - Adicione sinônimos comuns e termos relacionados
   - Considere variações de escrita (com/sem acentos, etc.)

2. **Ajuste de Scoring**:
   - Revise as métricas de busca para identificar padrões
   - Ajuste os pesos do scoring para seus dados específicos
   - Considere boosting para produtos em destaque

## Exemplos de Implementação

### Integração Básica com Frontend

```javascript
// Função para busca de produtos
async function searchProducts(term, filters = {}) {
  const params = new URLSearchParams({
    q: term,
    ...filters
  });
  
  const response = await fetch(`/api/search-products?${params}`);
  return await response.json();
}

// Função para sugestões de autocompletar
async function getSuggestions(term) {
  if (!term || term.length < 2) return [];
  
  const response = await fetch(`/api/search/suggest?q=${encodeURIComponent(term)}`);
  const data = await response.json();
  
  return data.suggestions || [];
}
```

### Atualizando o Índice em CI/CD

```bash
#!/bin/bash
# Script para atualizar o índice de busca após deploy

# Obter produtos atualizados
products=$(curl -s https://your-api.com/products?limit=1000)

# Atualizar índice de busca
curl -X POST https://your-site.com/api/search-update \
  -H "Authorization: Bearer $SEARCH_INDEX_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"products\": $products}"
```

## Próximos Passos

1. **Melhorias de Relevância**:
   - Implementar feedback de cliques para melhorar o ranking
   - Adicionar boosts para produtos sazonais/promocionais
   - Implementar suporte a sinonímios mais avançado

2. **Otimizações de Performance**:
   - Aprimorar algoritmo de warm-up com ML para prever tendências
   - Implementar sharding para índices muito grandes
   - Adicionar suporte a geo-localização para resultados contextuais

3. **Integração com Recomendações**:
   - Conectar com sistemas de recomendação para busca personalizada
   - Implementar "Quem buscou X também buscou Y"
   - Adicionar insights de comportamento baseados em padrões de busca