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

## Sequência de Implementação de Páginas

Seguiremos uma abordagem progressiva, construindo o marketplace página por página, adicionando os componentes necessários dentro de cada página conforme avançamos.

### 1. Página de Listagem de Produtos (Vitrine)
- Componentes a implementar:
  - [x] ProductCard (básico já implementado)
  - [x] Filtros de pesquisa (preço, categoria, atributos)
  - [x] Paginação com scroll infinito
  - [x] Ordenação de resultados
  - [x] Breadcrumbs
  - [x] Visualização em grade/lista
  - [x] Rating (avaliações)
  - [ ] Integração com dados reais do Astro DB

### 2. Página de Produto Individual
- Componentes a implementar:
  - [x] Galeria de imagens com miniaturas
  - [x] Seletor de variações (cor, tamanho, etc.)
  - [x] Sistema de avaliações e comentários
  - [x] Produtos relacionados
  - [x] Botão Comprar
  - [x] Botão Adicionar à lista de desejos
  - [x] Informações do vendedor
  - [x] Estimativa de frete
  - [x] Abas de descrição, especificações, avaliações
  - [ ] Integração com dados reais do Astro DB

### 3. Página da Home Marketplace
- Componentes a implementar:
  - [ ] Banner principal rotativo
  - [ ] Carrossel de categorias
  - [ ] Seções de produtos (mais vendidos, ofertas)
  - [ ] Banners promocionais
  - [ ] Destaques de vendedores
  - [ ] Newsletter
  - [ ] Menu de categorias dinâmico

### 4. Carrinho de Compras
- Componentes a implementar:
  - [ ] Lista de itens do carrinho
  - [ ] Resumo do pedido
  - [ ] Cupom de desconto
  - [ ] Cálculo de frete
  - [ ] Sugestões de produtos complementares

### 5. Checkout
- Componentes a implementar:
  - [ ] Formulário de dados do cliente
  - [ ] Seleção de endereço
  - [ ] Opções de entrega
  - [ ] Opções de pagamento
  - [ ] Resumo do pedido
  - [ ] Confirmação

### 6. Minha Conta (Área do Cliente)
- Componentes a implementar:
  - [ ] Dashboard do cliente
  - [ ] Histórico de pedidos
  - [ ] Lista de desejos
  - [ ] Gerenciamento de endereços
  - [ ] Avaliações feitas
  - [ ] Dados pessoais

### 7. Área do Vendedor
- Componentes a implementar:
  - [ ] Dashboard do vendedor
  - [ ] Gestão de produtos
  - [ ] Gestão de pedidos
  - [ ] Relatórios de vendas
  - [ ] Configurações da loja

### 8. Páginas Administrativas
- Componentes a implementar:
  - [ ] Dashboard administrativo
  - [ ] Gestão de vendedores
  - [ ] Gestão de categorias
  - [ ] Gestão de comissões
  - [ ] Relatórios gerais