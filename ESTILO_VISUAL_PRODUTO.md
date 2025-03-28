# Padronização de Estilo Visual Entre Páginas de Produto e Listagem

Este documento contém instruções específicas para garantir que a página de produto tenha o mesmo estilo visual da página `/produtos`, mantendo a consistência em todo o site.

## Problema Principal

A página de produto (`/produto/[slug].astro`) não está usando o mesmo layout que a página de listagem (`/produtos/index.astro`), resultando em diferenças visuais e falta de recursos:

1. A página de produto usa `Layout.astro` enquanto a página de listagem usa `MarketplaceLayout.astro`
2. Recursos visuais como cabeçalho, rodapé e fontes não estão consistentes
3. Faltam componentes específicos como menu de categorias padronizado
4. Erros 404 para fontes e scripts necessários

## Solução: Alterações Necessárias

### 1. Modificar o Componente de Página do Produto

Substitua o layout usado na página `/produto/[slug].astro`:

```astro
---
// ANTES
import Layout from '../../layouts/Layout.astro';

// DEPOIS
import MarketplaceLayout from '../../layouts/MarketplaceLayout.astro';
---

// Substitua todas as referências a Layout por MarketplaceLayout
<MarketplaceLayout title={product.name}>
  ...
</MarketplaceLayout>
```

### 2. Adicionar Meta Tags e Estilos Consistentes

```astro
<MarketplaceLayout 
  title={product.name}
  description={product.short_description || `${product.name} - Compre agora online!`}
  canonicalUrl={`${Astro.url.origin}/produto/${product.slug}`}
  ogImage={product.images && product.images.length > 0 ? product.images[0].image_url : '/og-image.png'}
>
  <Fragment slot="head">
    <!-- Schema.org JSON-LD para SEO -->
    <script type="application/ld+json" set:html={JSON.stringify({
      "@context": "https://schema.org/",
      "@type": "Product",
      "name": product.name,
      "description": product.short_description,
      "image": product.images && product.images.length > 0 ? product.images[0].image_url : null,
      "sku": product.sku,
      "mpn": product.sku,
      "brand": {
        "@type": "Brand",
        "name": product.vendor_name || "Loja Grão de Gente"
      },
      "offers": {
        "@type": "Offer",
        "url": `${Astro.url.origin}/produto/${product.slug}`,
        "priceCurrency": "BRL",
        "price": product.price,
        "priceValidUntil": new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
        "availability": product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock"
      }
    })} />
  </Fragment>

  <!-- Conteúdo da página -->
  <div class="bg-white">
    <!-- O componente CategoryMenu já está incluído no MarketplaceLayout -->
    <!-- Resto do conteúdo... -->
  </div>
</MarketplaceLayout>
```

### 3. Remover Componentes Redundantes

Remova o componente `CategoryMenu` importado manualmente, pois ele já está incluído no `MarketplaceLayout`:

```astro
// REMOVER esta linha
import CategoryMenu from '../../components/navigation/CategoryMenu.astro';

// E REMOVER a referência a ele no template
<CategoryMenu />
```

### 4. Ajustar Classes CSS para Seguir o Padrão do Marketplace

```astro
<!-- Adicionando classes consistentes com o design system -->

<!-- Breadcrumbs com classes corretas -->
<div class="container mx-auto px-4 py-2">
  <nav class="text-sm text-gray-500 mb-4">
    <ol class="flex items-center">
      <li>
        <a href="/" class="hover:text-cyan500 transition-colors">Home</a>
      </li>
      <li class="flex items-center">
        <span class="mx-1">/</span>
        <a href="/produtos" class="hover:text-cyan500 transition-colors">Produtos</a>
      </li>
      <!-- ... -->
    </ol>
  </nav>
</div>

<!-- Botões com classes de cor corretas -->
<Button 
  id="add-to-cart-btn"
  variant="primary" 
  class="px-8 py-3 text-base flex-1 bg-cyan500 hover:bg-cyan600"
>
  {product.stock > 0 ? 'Adicionar ao Carrinho' : 'Produto Indisponível'}
</Button>
```

### 5. Atualizar as Importações de Recursos Estáticos

Garantir que os caminhos para fontes e scripts no head estejam corretos:

```html
<!-- Adicionar no head se necessário -->
<link href="/fonts/inter/font-face.css" rel="stylesheet">
<script src="/lib/performance/font-loader.js" defer></script>
<script src="/lib/performance/prefetch-manager.js" defer></script>
<script src="/lib/performance/adaptive-cache.js" defer></script>
```

### 6. Garantir Integração com Scripts JS

```javascript
// No final do script
document.addEventListener('DOMContentLoaded', function() {
  // Código existente...
  
  // Adicionar integração com o carrinho do MarketplaceLayout
  if (addToCartBtn) {
    addToCartBtn.addEventListener('click', function() {
      const quantity = parseInt(document.getElementById('quantity-input').value);
      const variantId = document.getElementById('selected-variant-id')?.value || null;
      
      // Integração com o store carrinho
      if (window.Alpine) {
        window.Alpine.store('cart').addItem({
          id: product.id,
          variantId: variantId,
          quantity: quantity,
          price: product.price,
          name: product.name,
          image: product.images?.[0]?.image_url
        });
      }
      
      // Mostrar mensagem de sucesso
      alert('Produto adicionado ao carrinho!');
    });
  }
});
```

## Resumo de Alterações

1. **Layout**: Substituir `Layout.astro` por `MarketplaceLayout.astro`
2. **Componentes Redundantes**: Remover componentes que já existem no MarketplaceLayout
3. **Classes CSS**: Ajustar para usar as cores padrão do marketplace (cyan500, etc.)
4. **Recursos Estáticos**: Corrigir caminhos para fontes e scripts
5. **Integração JS**: Garantir integração com os stores Alpine.js existentes
6. **SEO**: Manter as meta tags e schema.org para SEO

Estas alterações garantirão que a página de produto tenha exatamente o mesmo estilo visual da página de listagem, mantendo a consistência visual em todo o site e resolvendo os problemas de recursos faltantes.