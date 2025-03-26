# Implementação do Marketplace Grão de Gente

Este documento acompanha o progresso da implementação do marketplace "Grão de Gente" baseado no framework Freedom Stack (Astro, Alpine.js, Tailwind CSS).

## Visão Geral do Projeto

Um marketplace completo e moderno que permite que diversos lojistas vendam seus produtos em um único ambiente, com foco em performance, SEO e acessibilidade.

### Esclarecimento Importante sobre o Freedom Stack
O Freedom Stack não é uma API externa ou serviço separado, mas sim o nome dado à combinação de tecnologias utilizadas neste projeto:
- Astro (renderização e roteamento)
- Alpine.js (interatividade no cliente)
- Tailwind CSS e daisyUI (estilização)
- Astro DB/Turso (banco de dados)

Todas as integrações devem ser feitas usando os recursos nativos dessas tecnologias, especialmente o sistema de banco de dados Astro DB e o mecanismo de actions do Astro.

### Tecnologias Principais
- **AstroJS**: Framework principal para renderização híbrida (SSG/SSR)
- **Alpine.js**: Para interatividade do cliente
- **Astro DB**: Para armazenamento e consulta de dados
- **Cloudflare Pages/Workers**: Para hospedagem e APIs serverless
- **FlexSearch**: Biblioteca para implementação de busca avançada

## Status das Implementações

### Em Progresso
- [x] Documento de acompanhamento criado
- [x] Design System documentado (DESIGN_SYSTEM.md)
- [x] Implementação da base do design system
  - [x] Configuração do tema daisyUI/Tailwind com as cores do Grão de Gente
  - [x] Estilização global com CSS para o design system
  - [x] Componentes UI básicos (Button, Card, ProductCard, Badge, TextField, Select)
  - [x] Componentes de layout (Navbar, Footer, Layout)
  - [x] Página de demonstração em `/marketplace-demo`

### Pendente
- [ ] **Gestão de Vendedores**
  - [ ] Onboarding de vendedores
  - [ ] Dashboard para vendedores
  - [ ] Sistema de comissões
  - [ ] Avaliações de vendedores
  - [ ] Relatórios financeiros

- [ ] **Catálogo Multi-vendedor**
  - [ ] Gestão de produtos por vendedor
  - [ ] Categorização unificada
  - [ ] Atributos por categoria
  - [ ] Sistema de variações
  - [ ] Comparação de ofertas
  - [ ] Tabelas de frete personalizadas
  - [ ] Sistema de busca avançada com FlexSearch

- [ ] **Gestão de Disputas**
  - [ ] Sistema de tickets
  - [ ] Mediação
  - [ ] Políticas de reembolso
  - [ ] Avaliações de transações

- [ ] **Pagamentos e Repasses**
  - [ ] Split de pagamentos
  - [ ] Múltiplos métodos de pagamento
  - [ ] Períodos de repasse
  - [ ] Retenção para segurança
  - [ ] Extrato detalhado

- [ ] **Implementações Técnicas**
  - [x] Drizzle ORM com Astro DB para armazenamento de dados
  - [x] Sistema de Actions nativo do Astro para API
  - [x] Better-auth para Autenticação (já configurado)
  - [x] Alpine.js com Stores para Estado (implementado para carrinho e wishlist)
  - [ ] FlexSearch para sistema de busca
  - [ ] Modelagem de dados para categorias e produtos
  - [ ] Implementação do menu dinâmico baseado em categorias

## Design System

O design segue o estilo visual do site Grão de Gente, com ênfase em:

### Cores:
- Primária: Tonalidades de ciano/turquesa
- Neutra: Tons de cinza
- Destaque/Acento: Tons de rosa
- Base: Branco

### Tipografia:
- Lato como fonte principal
- Sistema responsivo com base em rem

## Elementos Adicionais

- [ ] **Sistema de Busca Avançada**
  - [ ] Busca por vendedor
  - [ ] Busca por categoria
  - [ ] Busca por atributos
  - [ ] Busca combinada com filtros
  - [ ] Sugestões e autocomplete

- [ ] **Sistema de Notificações**
  - [ ] Notificações para vendedores
  - [ ] Notificações para compradores
  - [ ] Alertas de estoque e pedidos
  - [ ] Notificações de promoções

- [ ] **Pagamentos e Financeiro**
  - [ ] Integração com gateways de pagamento
  - [ ] Sistema de promoções e cupons
  - [ ] Descontos por vendedor/produto

- [ ] **Sistemas de Frete Flexíveis**
  - [ ] Frete por produto
  - [ ] Frete por loja/vendedor
  - [ ] Frete por total do carrinho
  - [ ] Frete por região/CEP

- [ ] **Funcionalidades de Usuário**
  - [ ] Wishlist/listas de favoritos
  - [ ] Histórico de pedidos
  - [ ] Carrinho salvo/abandonado

- [ ] **Operações e Logística**
  - [ ] Gestão de devoluções e trocas
  - [ ] Integração com serviços de logística
  - [ ] Suporte ao cliente centralizado
  - [ ] Gestão de estoque multi-vendedor

- [ ] **Análise e Business Intelligence**
  - [ ] Dashboards de performance
  - [ ] Análise de comportamento do usuário
  - [ ] Relatórios de vendas por vendedor/categoria
  - [ ] Métricas de conversão e abandono

## Nova Sequência de Implementação (Modelo-Primeiro)

Para um desenvolvimento mais eficiente e estruturado, adotaremos uma abordagem "modelo-primeiro" que define completamente a estrutura de dados antes de implementar a interface. Esta abordagem minimiza retrabalho e facilita a integração entre os componentes.

### 1. Modelagem Completa do Banco de Dados
- [ ] **Esquema de Categorias e Produtos**
  - [x] Definição de tabela de Categorias (hierárquica)
  - [ ] Definição de tabela de CIDs para Categorias (para usar em URLs e identificação)
  - [ ] Definição de tabela de Produtos
  - [ ] Definição de tabela de Variantes de Produtos
  - [ ] Definição de tabela de Imagens de Produtos
  - [ ] Definição de tabela de Atributos e Valores
  - [ ] Definição de tabela de Avaliações de Produtos

- [ ] **Esquema de Usuários e Vendedores**
  - [x] Definição de tabela de Usuários (já existente via Better-auth)
  - [ ] Definição de tabela de Perfis de Usuário (extensão do Better-auth)
  - [ ] Definição de tabela de Vendedores/Lojistas
  - [ ] Definição de tabela de Configurações de Vendedor
  - [ ] Definição de tabela de Endereços (usuários e vendedores)

- [ ] **Esquema de Pedidos e Carrinho**
  - [ ] Definição de tabela de Pedidos
  - [ ] Definição de tabela de Itens de Pedido
  - [ ] Definição de tabela de Status de Pedido
  - [ ] Definição de tabela de Pagamentos
  - [ ] Definição de tabela temporária de Carrinho

- [ ] **Esquema de Frete e Entrega**
  - [ ] Definição de tabela de Regras de Frete por Vendedor
  - [ ] Definição de tabela de Faixas de CEP para cálculo de frete
  - [ ] Definição de tabela de Frete por Produto (para produtos com frete especial)
  - [ ] Definição de tabela de Prazos de Entrega por região
  - [ ] Definição de tabela de Consolidação de Frete (para multi-vendedor)

- [ ] **Esquema de Conteúdo e Configurações**
  - [ ] Definição de tabela de Links de Menu (não-categorias)
  - [ ] Definição de tabela de Banners
  - [ ] Definição de tabela de Páginas Estáticas (CMS)
  - [ ] Definição de tabela de Blocos de Conteúdo Reutilizáveis
  - [ ] Definição de tabela de SEO (meta tags, configurações por página)
  - [ ] Definição de tabela de Configurações Globais

### 2. Scripts de Migração e Seed de Dados
- [ ] **Migrations**
  - [ ] Criar migration inicial para esquema base
  - [ ] Criar migration para tabelas de produtos e categorias
  - [ ] Criar migration para tabelas de vendedores
  - [ ] Criar migration para tabelas de frete
  - [ ] Criar migration para tabelas de conteúdo

- [ ] **Seeds**
  - [ ] Desenvolver seed para categorias e subcategorias (com CIDs)
  - [ ] Desenvolver seed para produtos de exemplo (com variantes)
  - [ ] Desenvolver seed para regras de frete (por vendedor, por região)
  - [ ] Desenvolver seed para usuários e vendedores de teste
  - [ ] Desenvolver seed para páginas estáticas de exemplo
  - [ ] Desenvolver seed para banners e conteúdo da home

### 3. Implementação dos Serviços de Acesso a Dados
- [ ] **Serviço de Categorias**
  - [ ] Implementar getCategoryTree (hierarquia completa)
  - [ ] Implementar getMainCategories (categorias principais)
  - [ ] Implementar getSubcategories (subcategorias de uma categoria)
  - [ ] Implementar getCategoryByCid (busca por identificador único)
  - [ ] Implementar getMenuWithCategories (menu completo com categorias e links)

- [ ] **Serviço de Produtos**
  - [ ] Implementar listProducts (com filtros e paginação)
  - [ ] Implementar getProductById (com todas as relações)
  - [ ] Implementar getProductsByCategoryId
  - [ ] Implementar getProductVariants (variações de um produto)
  - [ ] Implementar getRelatedProducts (produtos relacionados)
  - [ ] Implementar searchProducts (busca avançada com FlexSearch)

- [ ] **Serviço de Usuários e Vendedores**
  - [ ] Integrar autenticação Better-auth existente
  - [ ] Implementar getUserProfile (perfil completo)
  - [ ] Implementar updateUserProfile
  - [ ] Implementar getVendorById (detalhes do vendedor)
  - [ ] Implementar getVendorProducts (produtos de um vendedor)

- [ ] **Serviço de Pedidos e Carrinho**
  - [ ] Implementar saveCart (salvar carrinho temporário)
  - [ ] Implementar getCart (recuperar carrinho)
  - [ ] Implementar createOrder (criar pedido a partir do carrinho)
  - [ ] Implementar getOrdersByUserId (pedidos do usuário)
  - [ ] Implementar getVendorOrders (pedidos por vendedor)
  - [ ] Implementar updateOrderStatus

- [ ] **Serviço de Frete**
  - [ ] Implementar calculateProductShipping (frete por produto)
  - [ ] Implementar calculateVendorShipping (frete consolidado por vendedor)
  - [ ] Implementar calculateCartShipping (frete total do carrinho)
  - [ ] Implementar getShippingDeadline (prazo por método de entrega)

- [ ] **Serviço de Conteúdo**
  - [ ] Implementar getStaticPage (buscar página estática pelo slug)
  - [ ] Implementar getBanners (buscar banners ativos)
  - [ ] Implementar getContentBlocks (blocos de conteúdo por posição)
  - [ ] Implementar getSeoSettings (configurações SEO por página)

### 4. Adaptação dos Componentes Visuais para Usar Dados Reais
- [ ] **Componentes Globais (primeiro)**
  - [ ] Menu de Navegação com categorias dinâmicas e CIDs
  - [ ] Sistema de busca integrado com FlexSearch
  - [ ] Componente de autenticação (login/registro via Better-auth)
  - [ ] Componente de gerenciamento de cabeçalho (SEO dinâmico)
  - [ ] Componente de renderização de páginas estáticas

- [ ] **Listagem de Produtos**
  - [x] ProductCard (já implementado visualmente)
  - [ ] Integrar ProductCard com dados reais do banco
  - [ ] Filtros funcionais conectados ao banco e categorias
  - [ ] Paginação por scroll infinito com dados reais
  - [ ] Breadcrumbs dinâmicos baseados em hierarquia de categorias
  - [ ] Ordenação funcional conectada ao banco
  - [ ] Sistema de filtros avançados por atributos dinâmicos

- [ ] **Página de Produto Individual**
  - [x] Layout de produto (já implementado visualmente)
  - [ ] Integrar galeria com imagens reais do banco
  - [ ] Seletor de variações dinâmico com atributos do banco
  - [ ] Sistema de avaliações real
  - [ ] Produtos relacionados dinâmicos
  - [ ] Cálculo de frete específico para o produto
  - [ ] Informação de disponibilidade em tempo real

- [ ] **Home do Marketplace**
  - [ ] Banners dinâmicos do banco
  - [ ] Produtos em destaque dinâmicos
  - [ ] Categorias em destaque com navegação
  - [ ] Destaques de vendedores
  - [ ] Blocos de conteúdo dinâmicos por posição

- [ ] **Carrinho e Checkout**
  - [ ] Integrar carrinho com banco de dados
  - [ ] Agrupar itens por vendedor no carrinho
  - [ ] Sistema de pagamento com múltiplos métodos
  - [ ] Cálculo de frete por produto, por vendedor e consolidado
  - [ ] Prazos de entrega dinâmicos
  - [ ] Endereços de usuário integrados

### 5. Perfis e Área Administrativa
- [ ] **Perfil do Cliente**
  - [ ] Dashboard do cliente com resumo de pedidos
  - [ ] Histórico de pedidos completo com status
  - [ ] Gerenciamento de endereços (múltiplos endereços)
  - [ ] Lista de desejos integrada com banco
  - [ ] Gerenciamento de cartões e métodos de pagamento
  - [ ] Avaliações de produtos comprados

- [ ] **Perfil do Vendedor**
  - [ ] Dashboard do vendedor com métricas
  - [ ] Gestão de produtos (CRUD completo)
  - [ ] Gestão de estoque e variantes
  - [ ] Configuração de regras de frete por região
  - [ ] Relatórios de vendas e financeiro
  - [ ] Gestão de pedidos e status
  - [ ] Configurações de loja (informações, política de devolução)

- [ ] **Área Administrativa**
  - [ ] Gestão de categorias com sistema de CIDs
  - [ ] Gestão de vendedores (aprovação, comissões)
  - [ ] Editor de páginas estáticas (CMS)
  - [ ] Gerenciamento de banners e promoções
  - [ ] Configuração de SEO global e por página
  - [ ] Gestão de disputas entre clientes e vendedores
  - [ ] Relatórios gerais e análise de performance

### 6. Otimizações e Funcionalidades Avançadas
- [ ] **SEO Avançado**
  - [ ] Meta tags dinâmicas por categoria e produto
  - [ ] Sitemap.xml dinâmico com todas as URLs
  - [ ] Rich snippets para produtos (schema.org)
  - [ ] URLs amigáveis com base em CIDs

- [ ] **Performance**
  - [ ] Implementação de cache para consultas frequentes
  - [ ] Otimização de imagens com diferentes tamanhos
  - [ ] Lazy loading de componentes e imagens
  - [ ] Pré-renderização de páginas frequentes

- [ ] **Integrações**
  - [ ] Gateway de pagamento
  - [ ] Serviço de envio de emails transacionais
  - [ ] APIs de cálculo de frete externas
  - [ ] Compartilhamento em redes sociais

## Componentes Visuais Já Implementados

Nota: Os componentes visuais abaixo já foram implementados, mas ainda precisam ser integrados com dados reais do banco:

### 1. Página de Listagem de Produtos (Vitrine)
- Componentes implementados visualmente:
  - [x] ProductCard 
  - [x] Filtros de pesquisa (preço, categoria, atributos)
  - [x] Paginação com scroll infinito
  - [x] Ordenação de resultados
  - [x] Breadcrumbs
  - [x] Visualização em grade/lista
  - [x] Rating (avaliações)

### 2. Página de Produto Individual
- Componentes implementados visualmente:
  - [x] Galeria de imagens com miniaturas
  - [x] Seletor de variações (cor, tamanho, etc.)
  - [x] Sistema de avaliações e comentários
  - [x] Produtos relacionados
  - [x] Botão Comprar
  - [x] Botão Adicionar à lista de desejos
  - [x] Informações do vendedor
  - [x] Estimativa de frete
  - [x] Abas de descrição, especificações, avaliações