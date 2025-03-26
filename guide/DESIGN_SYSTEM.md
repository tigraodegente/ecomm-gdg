# Design System - Grão de Gente Marketplace

Este guia define o sistema de design para o marketplace "Grão de Gente", implementado com Freedom Stack (Astro, Alpine.js e daisyUI/Tailwind CSS).

## 1. Configuração do Tema

### Configuração do daisyUI

O tema personalizado do Grão de Gente está configurado no arquivo `tailwind.config.mjs`:

```js
daisyui: {
  themes: [
    {
      graodegente: {
        primary: "#00BFB3",
        "primary-dark": "#017F77",
        "primary-light": "#DFF9F7",
        secondary: "#312627",
        accent: "#D34566",
        "accent-light": "#F17179",
        neutral: "#4F4F4F",
        "base-100": "#FFFFFF",
        "base-200": "#F8F8F8",
        "base-300": "#EEEEEE",
        info: "#DFF9F7",
        success: "#86efac",
        warning: "#fde68a",
        error: "#fb7185",
        "--rounded-box": "1.4rem",
        "--rounded-btn": "5rem",
        "--rounded-badge": "5rem",
        "--animation-btn": "0.3s",
        "--btn-focus-scale": "0.95",
        "--border-btn": "2px",
        "--tab-radius": "0.8rem",
      }
    }
  ]
}
```

## 2. Tipografia

A família de fonte principal é Lato, com diferentes pesos para diferentes contextos.

```html
<!-- Importação da fonte -->
<link href="https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700;900&display=swap" rel="stylesheet">
```

Configuração de tipografia no CSS global:

```css
@layer base {
  html {
    font-size: 62.5%; /* 10px */
    font-family: 'Lato', sans-serif;
  }
  
  body {
    font-size: 1.6rem;
    line-height: 1.5;
  }
  
  h1 { font-size: 3.2rem; font-weight: 700; line-height: 1.2; }
  h2 { font-size: 2.8rem; font-weight: 700; line-height: 1.2; }
  h3 { font-size: 2.4rem; font-weight: 700; line-height: 1.2; }
  h4 { font-size: 2rem; font-weight: 700; line-height: 1.2; }
  h5 { font-size: 1.8rem; font-weight: 700; line-height: 1.2; }
  h6 { font-size: 1.6rem; font-weight: 700; line-height: 1.2; }
}
```

## 3. Componentes Principais

### 3.1 Botões

```astro
---
// Button.astro
interface Props {
  text: string;
  variant?: 'primary' | 'outlined' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  href?: string;
  onClick?: string;
}

const { 
  text, 
  variant = 'primary', 
  size = 'md', 
  fullWidth = false,
  href,
  onClick
} = Astro.props;

const sizeClasses = {
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg'
};

const classes = [
  'btn',
  `btn-${variant}`,
  sizeClasses[size],
  fullWidth ? 'w-full' : ''
].filter(Boolean).join(' ');

const Tag = href ? 'a' : 'button';
const props = href 
  ? { href } 
  : onClick 
    ? { type: 'button', 'x-on:click': onClick } 
    : { type: 'button' };
---

<Tag class={classes} {...props}>
  <slot name="icon-start" />
  {text}
  <slot name="icon-end" />
</Tag>
```

Uso:

```astro
<Button text="Comprar agora" variant="primary" />
<Button text="Ver mais" variant="outlined" />
<Button text="Promoção" variant="accent" />
```

### 3.2 Cards de Produto

```astro
---
// ProductCard.astro
interface Props {
  product: {
    id: string;
    name: string;
    price: number;
    oldPrice?: number;
    image: string;
    vendorName: string;
    vendorId: string;
  };
}

const { product } = Astro.props;
const discount = product.oldPrice 
  ? Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100) 
  : 0;
---

<div class="card product-card fade-in">
  {discount > 0 && <span class="badge badge-accent absolute top-2 right-2 z-10">-{discount}%</span>}
  
  <figure class="relative">
    <a href={`/product/${product.id}`}>
      <img src={product.image} alt={product.name} class="card-img" />
    </a>
    <button 
      class="btn btn-circle btn-sm absolute top-2 left-2"
      x-data="{}"
      x-on:click="$store.wishlist.toggle('${product.id}')"
      x-bind:class="$store.wishlist.has('${product.id}') ? 'btn-accent' : 'btn-ghost'"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
      </svg>
    </button>
  </figure>
  
  <div class="card-body">
    <a href={`/vendors/${product.vendorId}`} class="text-small text-primary">
      {product.vendorName}
    </a>
    
    <h3 class="card-title">
      <a href={`/product/${product.id}`}>{product.name}</a>
    </h3>
    
    <div class="flex items-center gap-sm">
      <span class="card-price">R$ {product.price.toFixed(2).replace('.', ',')}</span>
      {product.oldPrice && (
        <span class="card-old-price">R$ {product.oldPrice.toFixed(2).replace('.', ',')}</span>
      )}
    </div>
    
    <div class="card-actions mt-sm">
      <button 
        class="btn btn-primary w-full"
        x-data="{}"
        x-on:click="$store.cart.addItem({
          id: '${product.id}',
          name: '${product.name}',
          price: ${product.price},
          image: '${product.image}',
          vendorId: '${product.vendorId}',
          vendorName: '${product.vendorName}'
        })"
      >
        Adicionar ao carrinho
      </button>
    </div>
  </div>
</div>
```

### 3.3 Formulários

```astro
---
// TextField.astro
interface Props {
  id: string;
  name: string;
  label: string;
  type?: 'text' | 'email' | 'password' | 'number' | 'tel';
  placeholder?: string;
  required?: boolean;
  error?: string;
}

const { 
  id, 
  name, 
  label, 
  type = 'text', 
  placeholder = '', 
  required = false,
  error = ''
} = Astro.props;
---

<div class="form-group">
  <label for={id} class="form-label">
    {label} {required && <span class="text-error">*</span>}
  </label>
  
  <input
    id={id}
    name={name}
    type={type}
    placeholder={placeholder}
    required={required}
    class={`form-input ${error ? 'border-error' : ''}`}
  />
  
  {error && <p class="text-error text-small mt-xs">{error}</p>}
</div>
```

```astro
---
// Select.astro
interface Option {
  value: string;
  label: string;
}

interface Props {
  id: string;
  name: string;
  label: string;
  options: Option[];
  defaultValue?: string;
  required?: boolean;
  error?: string;
}

const { 
  id, 
  name, 
  label, 
  options, 
  defaultValue = '', 
  required = false,
  error = ''
} = Astro.props;
---

<div class="form-group">
  <label for={id} class="form-label">
    {label} {required && <span class="text-error">*</span>}
  </label>
  
  <select
    id={id}
    name={name}
    required={required}
    class={`form-input ${error ? 'border-error' : ''}`}
  >
    {options.map(option => (
      <option 
        value={option.value} 
        selected={option.value === defaultValue}
      >
        {option.label}
      </option>
    ))}
  </select>
  
  {error && <p class="text-error text-small mt-xs">{error}</p>}
</div>
```

### 3.4 Menu Principal

```astro
---
// Navbar.astro
import Button from './Button.astro';

interface NavItem {
  label: string;
  href: string;
  children?: NavItem[];
}

interface Props {
  navItems: NavItem[];
}

const { navItems } = Astro.props;
---

<header class="header">
  <div class="container header-container">
    <a href="/" class="logo">
      <img src="/images/logo.svg" alt="Grão de Gente" height="40" />
    </a>
    
    <div class="flex-1 mx-lg">
      <div class="form-group mb-0">
        <div class="relative">
          <input 
            type="text" 
            placeholder="O que você está procurando?"
            class="form-input rounded-pill pr-10"
            x-data="{}"
            x-on:focus="$store.search.showResults = true"
            x-on:blur="setTimeout(() => $store.search.showResults = false, 200)"
            x-on:input.debounce.300ms="$store.search.query($event.target.value)"
          />
          <button class="absolute right-3 top-1/2 -translate-y-1/2 text-primary">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
          
          <div 
            class="absolute w-full bg-white shadow-md rounded-md mt-1 z-30 border border-gray-200"
            x-data="{}"
            x-show="$store.search.showResults"
            x-cloak
          >
            <div x-show="$store.search.loading" class="p-md text-center">
              <span class="loading loading-spinner text-primary"></span>
            </div>
            
            <div x-show="!$store.search.loading && $store.search.results.length === 0" class="p-md text-center">
              Nenhum resultado encontrado
            </div>
            
            <template x-for="result in $store.search.results" :key="result.id">
              <a :href="`/product/${result.id}`" class="block p-sm hover:bg-base-200 flex items-center gap-sm">
                <img :src="result.image" :alt="result.name" class="w-16 h-16 object-cover rounded-md" />
                <div>
                  <p x-text="result.name" class="font-bold"></p>
                  <p class="text-primary">R$ <span x-text="result.price.toFixed(2).replace('.', ',')"></span></p>
                </div>
              </a>
            </template>
          </div>
        </div>
      </div>
    </div>
    
    <nav>
      <ul class="nav-list">
        {navItems.map(item => (
          <li class="relative group">
            <a href={item.href} class="nav-link">
              {item.label}
              {item.children && (
                <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 inline-block ml-xs" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </a>
            
            {item.children && (
              <ul class="absolute left-0 mt-1 w-48 bg-white shadow-md rounded-md hidden group-hover:block z-20">
                {item.children.map(child => (
                  <li>
                    <a href={child.href} class="block p-sm hover:bg-base-200">
                      {child.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
        
        <li>
          <div class="relative" x-data="{ open: false }">
            <button 
              class="nav-link flex items-center"
              x-on:click="open = !open"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              <span 
                class="badge badge-accent ml-xs"
                x-text="$store.cart.itemCount"
                x-show="$store.cart.itemCount > 0"
              ></span>
            </button>
            
            <div 
              class="absolute right-0 mt-1 w-80 bg-white shadow-md rounded-md z-20"
              x-show="open"
              x-on:click.away="open = false"
              x-cloak
            >
              <div class="p-md">
                <h3 class="text-lg font-bold mb-sm">Carrinho</h3>
                
                <div x-show="$store.cart.itemCount === 0" class="text-center py-md">
                  Seu carrinho está vazio
                </div>
                
                <template x-for="item in $store.cart.items" :key="item.id">
                  <div class="flex gap-sm border-b border-gray-200 py-sm">
                    <img :src="item.image" :alt="item.name" class="w-16 h-16 object-cover rounded-md" />
                    <div class="flex-1">
                      <p x-text="item.name" class="font-bold"></p>
                      <p class="text-small text-primary" x-text="item.vendorName"></p>
                      <div class="flex justify-between items-center mt-xs">
                        <div class="flex items-center gap-xs">
                          <button 
                            class="btn btn-xs btn-ghost"
                            x-on:click="$store.cart.decreaseQuantity(item.id)"
                          >-</button>
                          <span x-text="item.quantity"></span>
                          <button 
                            class="btn btn-xs btn-ghost"
                            x-on:click="$store.cart.increaseQuantity(item.id)"
                          >+</button>
                        </div>
                        <p class="text-primary">R$ <span x-text="(item.price * item.quantity).toFixed(2).replace('.', ',')"></span></p>
                      </div>
                    </div>
                    <button 
                      class="btn btn-ghost btn-xs"
                      x-on:click="$store.cart.removeItem(item.id)"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </template>
                
                <div x-show="$store.cart.itemCount > 0" class="mt-md">
                  <div class="flex justify-between font-bold mb-sm">
                    <span>Total:</span>
                    <span class="text-primary">R$ <span x-text="$store.cart.total.toFixed(2).replace('.', ',')"></span></span>
                  </div>
                  
                  <a href="/checkout" class="btn btn-primary w-full">
                    Finalizar compra
                  </a>
                </div>
              </div>
            </div>
          </div>
        </li>
        
        <li>
          <div class="relative" x-data="{ open: false }">
            <button 
              class="nav-link flex items-center"
              x-on:click="open = !open"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </button>
            
            <div 
              class="absolute right-0 mt-1 w-48 bg-white shadow-md rounded-md z-20"
              x-show="open"
              x-on:click.away="open = false"
              x-cloak
            >
              <div x-data="{}" x-show="!$store.auth.isAuthenticated">
                <a href="/sign-in" class="block p-sm hover:bg-base-200">Entrar</a>
                <a href="/sign-up" class="block p-sm hover:bg-base-200">Cadastrar</a>
              </div>
              
              <div x-data="{}" x-show="$store.auth.isAuthenticated">
                <a href="/account" class="block p-sm hover:bg-base-200">Minha conta</a>
                <a href="/orders" class="block p-sm hover:bg-base-200">Meus pedidos</a>
                <a href="/wishlist" class="block p-sm hover:bg-base-200">Lista de desejos</a>
                <a href="#" class="block p-sm hover:bg-base-200" x-on:click="$store.auth.logout()">Sair</a>
              </div>
            </div>
          </div>
        </li>
      </ul>
    </nav>
  </div>
</header>
```

## 4. Alpine.js Stores

### 4.1 Carrinho de Compras

```js
// stores/cart.js
document.addEventListener('alpine:init', () => {
  Alpine.store('cart', {
    items: [],
    
    init() {
      const savedCart = localStorage.getItem('cart');
      if (savedCart) {
        this.items = JSON.parse(savedCart);
      }
      
      this.$watch('items', () => {
        localStorage.setItem('cart', JSON.stringify(this.items));
      });
    },
    
    addItem(product, quantity = 1) {
      const existingItem = this.items.find(item => item.id === product.id);
      
      if (existingItem) {
        existingItem.quantity += quantity;
      } else {
        this.items.push({
          ...product,
          quantity
        });
      }
    },
    
    removeItem(id) {
      this.items = this.items.filter(item => item.id !== id);
    },
    
    increaseQuantity(id) {
      const item = this.items.find(item => item.id === id);
      if (item) {
        item.quantity += 1;
      }
    },
    
    decreaseQuantity(id) {
      const item = this.items.find(item => item.id === id);
      if (item && item.quantity > 1) {
        item.quantity -= 1;
      } else if (item) {
        this.removeItem(id);
      }
    },
    
    getItemsByVendor() {
      return this.items.reduce((acc, item) => {
        const vendorId = item.vendorId;
        if (!acc[vendorId]) {
          acc[vendorId] = [];
        }
        acc[vendorId].push(item);
        return acc;
      }, {});
    },
    
    get itemCount() {
      return this.items.reduce((total, item) => total + item.quantity, 0);
    },
    
    get total() {
      return this.items.reduce((total, item) => total + (item.price * item.quantity), 0);
    },
    
    get totalByVendor() {
      const itemsByVendor = this.getItemsByVendor();
      const result = {};
      
      for (const [vendorId, items] of Object.entries(itemsByVendor)) {
        result[vendorId] = items.reduce((total, item) => {
          return total + (item.price * item.quantity);
        }, 0);
      }
      
      return result;
    },
    
    clear() {
      this.items = [];
    }
  });
});
```

### 4.2 Sistema de Busca

```js
// stores/search.js
document.addEventListener('alpine:init', () => {
  Alpine.store('search', {
    results: [],
    loading: false,
    showResults: false,
    flexSearch: null,
    
    init() {
      this.initFlexSearch();
      this.loadProducts();
    },
    
    async initFlexSearch() {
      // Importação dinâmica do FlexSearch
      const FlexSearch = await import('flexsearch');
      
      // Configuração do índice
      this.flexSearch = new FlexSearch.Index({
        tokenize: "forward",
        resolution: 9,
        language: "pt"
      });
    },
    
    async loadProducts() {
      try {
        this.loading = true;
        const response = await fetch('/api/products/search-index');
        const products = await response.json();
        
        // Adicionar produtos ao índice
        products.forEach((product, index) => {
          this.flexSearch.add(index, `${product.name} ${product.description} ${product.vendorName} ${product.categories.join(' ')}`);
          product.searchIndex = index;
        });
        
        this.products = products;
        this.loading = false;
      } catch (error) {
        console.error('Erro ao carregar produtos para busca:', error);
        this.loading = false;
      }
    },
    
    query(term) {
      if (!term || term.length < 2 || !this.flexSearch) {
        this.results = [];
        return;
      }
      
      this.loading = true;
      
      // Executar a busca
      const searchResults = this.flexSearch.search(term);
      
      // Mapear resultados para produtos
      this.results = searchResults
        .map(index => this.products.find(p => p.searchIndex === index))
        .filter(Boolean)
        .slice(0, 5);
        
      this.loading = false;
    }
  });
});
```

## 5. Exemplo de Layout Completo

```astro
---
// Layout.astro
import Navbar from '../components/sections/Navbar.astro';
import Footer from '../components/sections/Footer.astro';

interface Props {
  title: string;
  description?: string;
  image?: string;
}

const { 
  title, 
  description = 'Marketplace Grão de Gente - Produtos para bebês e crianças',
  image = '/images/og-image.png'
} = Astro.props;

const navItems = [
  {
    label: 'Categorias',
    href: '#',
    children: [
      { label: 'Quarto do Bebê', href: '/categorias/quarto-do-bebe' },
      { label: 'Enxoval', href: '/categorias/enxoval' },
      { label: 'Brinquedos', href: '/categorias/brinquedos' },
      { label: 'Alimentação', href: '/categorias/alimentacao' },
      { label: 'Higiene e Banho', href: '/categorias/higiene-e-banho' },
    ]
  },
  {
    label: 'Vendedores',
    href: '/vendedores'
  },
  {
    label: 'Ofertas',
    href: '/ofertas'
  },
  {
    label: 'Contato',
    href: '/contato'
  }
];
---

<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{title} | Grão de Gente</title>
    <meta name="description" content={description} />
    
    <!-- Open Graph -->
    <meta property="og:title" content={`${title} | Grão de Gente`} />
    <meta property="og:description" content={description} />
    <meta property="og:image" content={image} />
    <meta property="og:type" content="website" />
    
    <!-- Fonte -->
    <link href="https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700;900&display=swap" rel="stylesheet">
    
    <!-- Favicon -->
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  </head>
  <body>
    <Navbar navItems={navItems} />
    
    <main>
      <slot />
    </main>
    
    <Footer />
    
    <script>
      // Importação das stores no cliente
      import '../js/stores/cart.js';
      import '../js/stores/auth.js';
      import '../js/stores/search.js';
      import '../js/stores/wishlist.js';
    </script>
  </body>
</html>
```

## 6. Customização do daisyUI

Para customizar o daisyUI e aplicar o estilo visual do Grão de Gente:

1. Atualize o `tailwind.config.mjs` com o tema personalizado.
2. Adicione um arquivo `src/global.css` com as variáveis CSS adicionais.
3. Assegure-se de que o daisyUI está instalado corretamente:

```bash
npm install daisyui@latest @tailwindcss/typography
```

## 7. Cores e Tokens de Design

A paleta completa de cores e tokens de design conforme o estilo do Grão de Gente:

| Token | Valor | Uso |
|-------|-------|-----|
| --color-primary | #00BFB3 | Cor principal para botões, links e destaques |
| --color-primary-dark | #017F77 | Hover, elementos ativos |
| --color-primary-light | #DFF9F7 | Backgrounds sutis, ícones |
| --color-accent | #D34566 | Elementos de destaque, promoções |
| --color-accent-light | #F17179 | Variação mais clara para destaques |
| --color-black | #000000 | Texto muito destacado |
| --color-gray-900 | #312627 | Texto principal |
| --color-gray-800 | #323232 | Subtítulos |
| --color-gray-700 | #4F4F4F | Texto de corpo |
| --border-radius-pill | 5rem | Botões arredondados |

## 8. Desenvolvimento Progressivo de Componentes

Os componentes serão implementados progressivamente conforme construímos cada página do marketplace. A ordem de implementação segue o plano detalhado no documento IMPLEMENTATION_PLAN.md:

### Página de Listagem de Produtos
- [x] ProductCard (básico)
- [x] Filtros
- [x] Paginação
- [x] Ordenação
- [x] Breadcrumbs
- [x] Rating

### Página de Produto Individual
- [ ] ImageGallery
- [ ] VariationSelector
- [ ] ReviewSystem
- [ ] RelatedProducts
- [ ] WishlistButton
- [ ] VendorInfo
- [ ] ShippingEstimator
- [ ] ProductTabs

### Sistema de Carrinho e Checkout
- [ ] CartList
- [ ] OrderSummary
- [ ] CouponInput
- [ ] ShippingCalculator
- [ ] CheckoutForm
- [ ] PaymentOptions

### Área do Cliente e do Vendedor
- [ ] DashboardWidgets
- [ ] OrderHistory
- [ ] WishlistManager
- [ ] AddressManager
- [ ] VendorDashboard
- [ ] ProductManager

A documentação de cada componente será atualizada à medida que for implementado.