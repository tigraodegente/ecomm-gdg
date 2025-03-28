/**
 * Store de Busca
 * 
 * Alpine.js store para gerenciar a funcionalidade de busca com FlexSearch
 * seguindo a arquitetura do Freedom Stack.
 */
document.addEventListener('alpine:init', () => {
  Alpine.store('search', {
    results: [],          // Resultados principais da busca
    categories: [],       // Categorias relevantes encontradas
    suggestions: [],      // Sugestões de busca relacionadas
    loading: false,
    showResults: false,
    flexSearch: null,
    products: [],
    searchTerm: '',
    hasSearched: false,
    recentSearches: [],
    
    init() {
      // Carregar dados mas não mostrar resultados imediatamente
      this.initFlexSearch();
      this.loadRecentSearches();
      this.showResults = false;
    },
    
    /**
     * Retorna dados de produtos padrão para fallback
     * @returns {Object} Dados de produtos padrão
     */
    getDefaultProductsData() {
      return {
        success: true,
        products: [
          {
            id: '1',
            name: 'Berço Montessoriano',
            description: 'Berço montessoriano em madeira natural',
            price: 899.90,
            image: 'https://gdg-images.s3.sa-east-1.amazonaws.com/gcp/logo-vertical-white.webp',
            slug: 'berco-montessoriano',
            vendorName: 'Móveis Infantis Ltda',
            category: 'Berços',
            searchData: 'Berço Montessoriano madeira natural quarto bebê montessori'
          },
          {
            id: '2',
            name: 'Kit Enxoval Completo',
            description: 'Kit enxoval com 20 peças para bebê',
            price: 349.90,
            image: 'https://gdg-images.s3.sa-east-1.amazonaws.com/gcp/logo-vertical-white.webp',
            slug: 'kit-enxoval-completo',
            vendorName: 'Baby Shop',
            category: 'Enxoval',
            searchData: 'Kit Enxoval Completo bebê roupa lençol fronha travesseiro'
          },
          {
            id: '3',
            name: 'Mobile Musical',
            description: 'Mobile musical para berço com estrelas e lua',
            price: 129.90,
            image: 'https://gdg-images.s3.sa-east-1.amazonaws.com/gcp/logo-vertical-white.webp',
            slug: 'mobile-musical',
            vendorName: 'Toys for Baby',
            category: 'Decoração',
            searchData: 'Mobile Musical berço cama bebê estrelas lua som música'
          }
        ]
      };
    },
    
    /**
     * Inicializa a biblioteca FlexSearch com configuração simplificada
     * Otimizado para busca de termos curtos e performance máxima
     */
    async initFlexSearch() {
      try {
        // Importar FlexSearch dinamicamente
        const FlexSearchModule = await import('flexsearch');
        const FlexSearch = FlexSearchModule.default || FlexSearchModule;
        
        console.log("FlexSearch importado com sucesso. Configurando...");
        
        // Configuração otimizada para termos curtos
        this.flexSearch = new FlexSearch.Document({
          document: {
            id: 'id',
            index: ['name', 'description', 'category', 'vendorName', 'searchData'],
            store: true  // Armazenar documento completo para acesso rápido
          },
          charset: "latin:extra",  // Suporte a acentos
          tokenize: "forward",     // Tokenização para prefixos (útil para autocompletar)
          optimize: true,          // Otimizar para performance
          resolution: 9,           // Alta resolução 
          cache: 100,              // Cache grande
          minlength: 1,            // Permitir termos de 1 caractere
          
          // Configuração para campos específicos
          index: {
            name: {
              charset: "latin:extra",
              tokenize: "forward",
              resolution: 9,
              minlength: 1,
              stemmer: false
            },
            searchData: {
              charset: "latin:extra",
              tokenize: "forward",
              resolution: 9,
              minlength: 1,
              stemmer: false
            }
          }
        });
        
        console.log("FlexSearch configurado com suporte a termos curtos (minlength: 1)");
        
        // Carregar produtos do servidor
        setTimeout(() => {
          this.loadProducts();
        }, 100);
      } catch (error) {
        console.error('Erro ao inicializar FlexSearch:', error);
      }
    },
    
    /**
     * Carrega produtos usando actions Astro e adiciona ao índice de busca otimizado
     */
    async loadProducts() {
      try {
        this.loading = true;
        console.log("Carregando produtos para o índice de busca...");
        
        // Tentar buscar diretamente do endpoint (sem cache)
        console.log('Buscando produtos do endpoint /api/searchindex');
        
        try {
          // Usar o endpoint otimizado de busca
          const response = await fetch('/api/searchindex?nocache=' + Date.now());
          
          if (!response.ok) {
            throw new Error(`Erro HTTP: ${response.status}`);
          }
          
          const data = await response.json();
          
          if (!data.success || !data.products || !Array.isArray(data.products)) {
            console.error('Formato de resposta inválido:', data);
            throw new Error('Formato de resposta inválido');
          }
          
          const { products } = data;
          console.log(`Carregados ${products.length} produtos da API com sucesso`);
          
          // Debug: Verificar produtos com "kit" no nome
          const kitsProducts = products.filter(p => p.name && p.name.toLowerCase().includes('kit'));
          console.log(`Produtos com "kit" no nome: ${kitsProducts.length}`);
          kitsProducts.forEach(p => console.log(`- ${p.name}`));
          
          // Limpar índice e adicionar novos produtos
          this.addProductsToIndex(products);
          
          return;
        } catch (error) {
          console.error('Erro ao buscar produtos da API:', error);
          console.log('Tentando utilizar cache ou dados locais...');
        }
        
        // Se falhou, tentar usar cache do localStorage
        try {
          const cachedIndex = localStorage.getItem('search_index_cache');
          if (cachedIndex) {
            const data = JSON.parse(cachedIndex);
            if (data.products && Array.isArray(data.products)) {
              console.log(`Usando ${data.products.length} produtos do cache local`);
              this.addProductsToIndex(data.products);
              return;
            }
          }
        } catch (e) {
          console.error('Erro ao ler cache:', e);
        }
        
        // Último recurso: usar dados de fallback
        console.log('Usando dados de fallback para busca');
        const fallbackData = this.getDefaultProductsData();
        this.addProductsToIndex(fallbackData.products);
      } catch (error) {
        console.error('Erro crítico ao carregar produtos para busca:', error);
        this.loading = false;
        
        // Garantir que temos ao menos alguns produtos para busca funcionar
        const fallbackData = this.getDefaultProductsData();
        this.products = fallbackData.products;
      }
    },
    
    /**
     * Adiciona produtos ao índice FlexSearch e atualiza store
     * @param {Array} products - Lista de produtos para indexar
     */
    addProductsToIndex(products) {
      if (!products || !Array.isArray(products) || products.length === 0) {
        console.error("Nenhum produto válido para indexação");
        this.loading = false;
        return;
      }
      
      console.log(`Indexando ${products.length} produtos com FlexSearch...`);
      
      // Armazenar produtos completos para acesso direto
      this.products = products;
      
      // Adicionar ao índice FlexSearch se disponível
      if (this.flexSearch && typeof this.flexSearch.add === 'function') {
        // Processar em lotes pequenos para não travar o navegador
        const BATCH_SIZE = 20;
        let processed = 0;
        
        const processNextBatch = async () => {
          const batch = products.slice(processed, processed + BATCH_SIZE);
          processed += batch.length;
          
          for (const product of batch) {
            try {
              if (!product || !product.id) continue;
              
              // Criar documento otimizado para busca
              const doc = {
                id: product.id,
                name: (product.name || '').toLowerCase(),
                description: (product.description || '').toLowerCase(),
                category: (product.category || '').toLowerCase(),
                vendorName: (product.vendorName || '').toLowerCase(),
                searchData: [
                  product.name || '',
                  product.description || '',
                  product.category || '',
                  product.vendorName || '',
                  product.searchData || ''
                ].join(' ').toLowerCase(),
                
                // Campos para store
                price: product.price,
                comparePrice: product.comparePrice,
                image: product.image,
                slug: product.slug
              };
              
              // Adicionar ao índice
              this.flexSearch.add(doc);
              
              // Debug para produtos com "kit"
              if (doc.name.includes('kit')) {
                console.log(`Produto indexado: ${product.name} (ID: ${product.id})`);
              }
            } catch (err) {
              console.error(`Erro ao indexar produto ${product.id}:`, err);
            }
          }
          
          // Continuar processando ou finalizar
          if (processed < products.length) {
            // Pausa para permitir que a UI responda
            await new Promise(resolve => setTimeout(resolve, 0));
            processNextBatch();
          } else {
            console.log(`Indexação concluída: ${products.length} produtos processados`);
            
            // Salvar no localStorage para acesso offline
            this.saveSearchIndexToCache({ success: true, products });
            
            // Extrair categorias para filtragem
            this.extractCategories();
            
            this.loading = false;
          }
        };
        
        // Iniciar processamento
        processNextBatch();
      } else {
        console.warn("FlexSearch não está disponível para indexação");
        this.extractCategories();
        this.loading = false;
      }
    },
    
    /**
     * Salva o índice de busca no cache com compressão
     * @param {Object} data - Dados a serem salvos
     */
    saveSearchIndexToCache(data) {
      try {
        // Otimizar os dados antes de salvar no cache
        const optimizedData = {
          success: true,
          products: data.products.map(p => ({
            id: p.id,
            name: p.name,
            description: p.description || '',
            price: p.price,
            comparePrice: p.comparePrice,
            image: p.image,
            slug: p.slug || p.id,
            vendorName: p.vendorName || '',
            category: p.category || '',
            searchData: p.searchData || ''
          }))
        };
        
        // Salvar versão otimizada no localStorage
        localStorage.setItem('search_index_cache', JSON.stringify(optimizedData));
        localStorage.setItem('search_index_timestamp', Date.now().toString());
        
        console.log('Índice de busca salvo no cache com', optimizedData.products.length, 'produtos');
      } catch (error) {
        console.error('Erro ao salvar índice de busca no cache:', error);
      }
    },
    
    /**
     * Extrai categorias únicas dos produtos para filtros rápidos
     */
    extractCategories() {
      // Mapa para contar produtos por categoria
      const categoriesMap = new Map();
      
      this.products.forEach(product => {
        if (product.category) {
          if (!categoriesMap.has(product.category)) {
            categoriesMap.set(product.category, {
              name: product.category,
              count: 1
            });
          } else {
            const cat = categoriesMap.get(product.category);
            categoriesMap.set(product.category, {
              ...cat,
              count: cat.count + 1
            });
          }
        }
      });
      
      // Transformar mapa em array ordenado por contagem
      const allCategories = Array.from(categoriesMap.values())
        .sort((a, b) => b.count - a.count);
      
      // Armazenar todas as categorias para uso nos filtros
      this.allCategories = allCategories;
      
      console.log('Extraídas', allCategories.length, 'categorias únicas dos produtos');
    },
    
    /**
     * Realiza uma busca instantânea usando FlexSearch com suporte a relevância avançada
     * @param {string} term - Termo de busca
     */
    async query(term) {
      this.searchTerm = term;
      
      // Log para diagnóstico
      console.log(`Buscando por termo: "${term}"`);
      
      // Permitir termos com pelo menos 1 caractere
      if (!term || term.length < 1) {
        this.results = [];
        this.categories = [];
        this.suggestions = [];
        this.showResults = false;
        return;
      }
      
      // Verificar se FlexSearch foi inicializado
      if (!this.flexSearch) {
        console.warn("FlexSearch não foi inicializado ainda");
        
        // Busca direta nos produtos (fallback)
        const results = this.directSearch(term);
        if (results.length > 0) {
          console.log(`Encontrados ${results.length} resultados via busca direta`);
          this.results = results.slice(0, 6);
          this.showResults = true;
          this.hasSearched = true;
          return;
        } else {
          console.log("Nenhum resultado encontrado via busca direta");
          this.showResults = true;
          this.hasSearched = true;
          this.results = [];
          return;
        }
      }
      
      this.loading = true;
      this.showResults = true;
      
      try {
        const searchTerm = term.toLowerCase();
        
        // BUSCA DIRETA - abordagem confiável para termos curtos
        const directResults = this.directSearch(term);
        console.log(`Busca direta encontrou ${directResults.length} resultados`);
        
        if (directResults.length > 0) {
          this.results = directResults.slice(0, 6);
          this.extractResultCategories(directResults);
          this.hasSearched = true;
          this.loading = false;
          return;
        }
        
        // Se não encontrou nada na busca direta, tentar com FlexSearch
        try {
          // Buscar em múltiplos campos
          const searchConfig = {
            limit: 20,
            suggest: true,
            enrich: true
          };
          
          // Busca em campos principais
          const nameResults = await this.flexSearch.search("name", term, searchConfig);
          const searchDataResults = await this.flexSearch.search("searchData", term, searchConfig);
          
          // Extrair documentos únicos dos resultados
          const resultsMap = new Map();
          
          // Processar resultados por nome (maior peso)
          nameResults.forEach(resultGroup => {
            resultGroup.result.forEach(match => {
              if (match.doc) {
                resultsMap.set(match.doc.id, {
                  ...match.doc,
                  _score: 10
                });
              }
            });
          });
          
          // Processar resultados por dados de busca
          searchDataResults.forEach(resultGroup => {
            resultGroup.result.forEach(match => {
              if (match.doc) {
                // Se já existe, aumentar pontuação, senão adicionar
                if (resultsMap.has(match.doc.id)) {
                  const existing = resultsMap.get(match.doc.id);
                  resultsMap.set(match.doc.id, {
                    ...existing,
                    _score: existing._score + 5
                  });
                } else {
                  resultsMap.set(match.doc.id, {
                    ...match.doc,
                    _score: 5
                  });
                }
              }
            });
          });
          
          // Converter mapa para array e ordenar por pontuação
          let results = Array.from(resultsMap.values())
            .sort((a, b) => b._score - a._score);
            
          console.log(`FlexSearch encontrou ${results.length} resultados`);
          
          // Se ainda não encontrou nada, usar a busca direta como último recurso
          if (results.length === 0) {
            console.log("Usando resultados da busca direta como fallback");
            results = directResults;
          }
          
          // Processar categorias e sugestões
          this.extractResultCategories(results);
          
          // Limitar os resultados para a UI
          this.results = results.slice(0, 6);
          
          // Manter histórico
          this.hasSearched = true;
          
          // Adicionar termo às buscas recentes se houver resultados
          if (this.results.length > 0) {
            this.addToRecentSearches(term);
          }
        } catch (err) {
          console.error("Erro ao buscar com FlexSearch:", err);
          // Fallback para busca direta
          this.results = directResults.slice(0, 6);
          this.extractResultCategories(directResults);
        }
      } catch (error) {
        console.error('Erro ao realizar busca:', error);
        this.results = [];
        this.categories = [];
        this.suggestions = [];
      } finally {
        this.loading = false;
      }
    },
    
    /**
     * Realiza busca direta nos produtos (sem FlexSearch)
     * @param {string} term - Termo de busca
     * @returns {Array} Resultados da busca
     */
    directSearch(term) {
      const searchTerm = term.toLowerCase();
      
      return this.products.filter(product => {
        if (!product || !product.name) return false;
        
        // Busca em todos os campos relevantes
        const searchableText = [
          product.name,
          product.description || '',
          product.category || '',
          product.vendorName || '',
          product.searchData || ''
        ].join(' ').toLowerCase();
        
        // Para termos curtos, verificamos várias condições
        return (
          // Correspondência exata no nome
          product.name.toLowerCase() === searchTerm ||
          // Palavra no início do nome
          product.name.toLowerCase().startsWith(searchTerm) ||
          // Palavra no nome
          product.name.toLowerCase().includes(` ${searchTerm} `) ||
          // Em qualquer lugar do nome
          product.name.toLowerCase().includes(searchTerm) ||
          // Em qualquer campo de texto
          searchableText.includes(searchTerm)
        );
      }).map(product => ({
        ...product,
        _score: 100 // Score padrão para ordenação
      }));
    },
    
    /**
     * Extrai categorias e sugestões dos resultados da busca
     * @param {Array} results - Resultados da busca
     */
    extractResultCategories(results) {
      // Extrair categorias dos resultados
      const categoriesMap = new Map();
      
      results.forEach(product => {
        if (product.category) {
          if (!categoriesMap.has(product.category)) {
            categoriesMap.set(product.category, {
              name: product.category,
              count: 1
            });
          } else {
            const cat = categoriesMap.get(product.category);
            categoriesMap.set(product.category, {
              ...cat,
              count: cat.count + 1
            });
          }
        }
      });
      
      // Obter as categorias mais relevantes
      this.categories = Array.from(categoriesMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
      
      // Gerar sugestões simples baseadas nos resultados
      this.suggestions = results
        .slice(0, 5)
        .map(p => p.name)
        .filter((v, i, a) => a.indexOf(v) === i);
    },
    
    /**
     * Busca produtos no servidor via API
     * @param {string} term - Termo de busca
     * @param {number} page - Número da página
     */
    async searchServer(term, page = 1) {
      try {
        if (!term || term.trim().length < 2) {
          return {
            products: [],
            pagination: { 
              total: 0, 
              page: 1, 
              totalPages: 0,
              hasNextPage: false,
              hasPrevPage: false
            }
          };
        }
        
        // Adicionar termo às buscas recentes
        this.addToRecentSearches(term);
        
        // Buscar via API
        const response = await fetch(`/api/search-products?q=${encodeURIComponent(term)}&page=${page}`);
        const data = await response.json();
        
        return {
          products: data.products || [],
          pagination: data.pagination || { 
            total: 0, 
            page: 1, 
            totalPages: 0,
            hasNextPage: false,
            hasPrevPage: false
          }
        };
      } catch (error) {
        console.error('Erro ao buscar no servidor:', error);
        return {
          products: [],
          pagination: { 
            total: 0, 
            page: 1, 
            totalPages: 0,
            hasNextPage: false,
            hasPrevPage: false
          }
        };
      }
    },
    
    /**
     * Executa uma busca completa e redireciona para a página de resultados
     * @param {string} term - Termo de busca
     */
    executeSearch(term) {
      if (!term || term.trim().length < 1) return;
      
      // Adicionar às buscas recentes
      this.addToRecentSearches(term);
      
      // Redirecionar para a página de resultados
      window.location.href = `/produtos?q=${encodeURIComponent(term.trim())}`;
    },
    
    /**
     * Limpa os resultados da busca
     */
    clearSearch() {
      this.searchTerm = '';
      this.results = [];
      this.showResults = false;
      this.hasSearched = false;
    },
    
    /**
     * Obtém a URL do produto
     * @param {Object} product - Objeto do produto
     * @returns {string} - URL do produto
     */
    getProductUrl(product) {
      return `/produto/${product.slug || product.id}`;
    },
    
    /**
     * Formata o preço com moeda
     * @param {number} price - Preço a ser formatado
     * @returns {string} - Preço formatado
     */
    formatPrice(price) {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      }).format(price);
    },
    
    /**
     * Calcula o desconto percentual
     * @param {number} price - Preço atual
     * @param {number} comparePrice - Preço original
     * @returns {number|null} - Percentual de desconto ou null
     */
    getDiscountPercent(price, comparePrice) {
      if (!comparePrice || comparePrice <= price) return null;
      return Math.round(((comparePrice - price) / comparePrice) * 100);
    },
    
    /**
     * Adiciona termo às buscas recentes
     * @param {string} term - Termo de busca
     */
    addToRecentSearches(term) {
      term = term.trim();
      if (!term) return;
      
      // Remove o termo se já existir
      const index = this.recentSearches.indexOf(term);
      if (index > -1) {
        this.recentSearches.splice(index, 1);
      }
      
      // Adiciona ao início das buscas recentes
      this.recentSearches.unshift(term);
      
      // Mantém apenas as 5 buscas mais recentes
      this.recentSearches = this.recentSearches.slice(0, 5);
      
      // Salva no localStorage
      localStorage.setItem('recentSearches', JSON.stringify(this.recentSearches));
    },
    
    /**
     * Carrega buscas recentes do localStorage
     */
    loadRecentSearches() {
      try {
        const savedSearches = localStorage.getItem('recentSearches');
        if (savedSearches) {
          this.recentSearches = JSON.parse(savedSearches);
        }
      } catch (error) {
        console.error('Erro ao carregar buscas recentes:', error);
        this.recentSearches = [];
      }
    },
    
    /**
     * Limpa buscas recentes
     */
    clearRecentSearches() {
      this.recentSearches = [];
      localStorage.removeItem('recentSearches');
    },
    
    /**
     * Destaca o termo de busca no texto
     * @param {string} text - Texto a ser destacado
     * @returns {string} - Texto destacado com HTML
     */
    highlightText(text) {
      if (!this.searchTerm || !text) return text;
      
      const regex = new RegExp(`(${this.searchTerm.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
      return text.replace(regex, '<span class="bg-yellow-100">$1</span>');
    },
    
    // Função para diagnóstico - pode ser chamada do console
    testSearch(term) {
      console.log(`TESTE DE BUSCA: "${term}"`);
      console.log(`FlexSearch inicializado: ${this.flexSearch !== null}`);
      console.log(`Produtos carregados: ${this.products.length}`);
      
      // Busca direta nos produtos
      const results = this.directSearch(term);
      console.log(`Resultados encontrados: ${results.length}`);
      
      if (results.length > 0) {
        results.slice(0, 3).forEach((p, i) => {
          console.log(`${i+1}. ${p.name} (${p.category})`);
        });
      } else {
        // Verificar produtos com termos semelhantes
        const similar = [];
        const termLower = term.toLowerCase();
        
        this.products.forEach(p => {
          const name = (p.name || '').toLowerCase();
          if (name.includes(termLower.substring(0, 2))) {
            similar.push(p);
          }
        });
        
        if (similar.length > 0) {
          console.log("Produtos semelhantes que poderiam corresponder:");
          similar.slice(0, 3).forEach((p, i) => {
            console.log(`${i+1}. ${p.name} (${p.category})`);
          });
        }
      }
      
      // Executar a busca normal
      this.query(term);
    }
  });
});