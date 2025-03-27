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
      this.initFlexSearch();
      this.loadRecentSearches();
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
        const FlexSearch = await import('flexsearch');
        
        // Configuração simplificada para garantir resultados com termos curtos
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
          worker: false,           // Desativar workers para simplicidade
          
          // Indexação simplificada por campo
          index: {
            name: {
              encode: false,       // Sem codificação para preservar termos exatos
              tokenize: "full",    // Tokenização completa para termos como "kit"
              resolution: 9,
              minlength: 1,        // Permitir termos muito curtos
              context: false       // Desativar contexto para simplicidade
            },
            searchData: {
              tokenize: "full",
              resolution: 9, 
              minlength: 1,
              context: false
            }
          }
        });
        
        // Carregar produtos do servidor via actions Astro
        // Usando setTimeout para garantir que o FlexSearch seja inicializado antes de carregar produtos
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
        
        // Cache de índice para evitar requisições desnecessárias
        const cachedIndex = localStorage.getItem('search_index_cache');
        const cachedTimestamp = localStorage.getItem('search_index_timestamp');
        const now = Date.now();
        const cacheValid = cachedTimestamp && (now - parseInt(cachedTimestamp) < 3600000); // 1 hora
        
        let data;
        
        // Tentar usar cache primeiro se for válido
        if (cacheValid && cachedIndex) {
          try {
            data = JSON.parse(cachedIndex);
            console.log('Usando índice de busca em cache');
          } catch (e) {
            console.warn('Erro ao ler cache:', e);
          }
        }
        
        // Se não tiver cache válido, buscar da API
        if (!data) {
          console.log('Buscando novo índice da API');
          
          try {
            // Usar o endpoint otimizado de busca
            const response = await fetch('/api/searchindex');
            data = await response.json();
            
            if (!data.success || !data.products || !Array.isArray(data.products)) {
              throw new Error('Formato de resposta inválido');
            }
            
            // Salvar no cache com compressão para reduzir tamanho
            this.saveSearchIndexToCache(data);
          } catch (error) {
            console.warn('Erro ao buscar produtos para indexação:', error);
            
            // Tentar usar cache mesmo que expirado
            if (cachedIndex) {
              try {
                data = JSON.parse(cachedIndex);
                console.log('Usando cache expirado como fallback');
              } catch (e) {
                // Fallback com produtos locais
                data = this.getDefaultProductsData();
              }
            } else {
              // Fallback com produtos locais
              data = this.getDefaultProductsData();
            }
          }
        }
        
        const { products } = data;
        
        // Limpar índice existente antes de adicionar novos produtos
        // Para evitar duplicatas em caso de recarregamento
        if (this.flexSearch && typeof this.flexSearch.add === 'function') {
          console.log('Limpando índice de busca antes de reindexar');
        }
        
        // Adicionar produtos ao índice de busca usando Document API
        console.log('Indexando', products.length, 'produtos com FlexSearch Document API');
        
        // Debug: Verificar se temos o produto específico com "kit" nos dados
        const hasKitProduct = products.some(p => p.name && p.name.toLowerCase().includes('kit'));
        console.log('Existe produto com "kit" no nome?', hasKitProduct);
        
        // Iniciar um novo índice do zero
        try {
          console.log('Recriando índice FlexSearch');
          const FlexSearch = await import('flexsearch');
          this.flexSearch = new FlexSearch.Document({
            document: {
              id: 'id',
              index: ['name', 'description', 'category', 'vendorName', 'searchData'],
              store: ['id', 'name', 'description', 'price', 'comparePrice', 'image', 'slug', 'vendorName', 'category']
            },
            tokenize: 'full',
            optimize: true,
            resolution: 9,
            minlength: 1,
            context: true
          });
        } catch (err) {
          console.error('Erro ao recriar índice FlexSearch:', err);
        }
        
        // Processar produtos em lotes para melhor performance
        const BATCH_SIZE = 20; // Reduzido para garantir melhor processamento
        for (let i = 0; i < products.length; i += BATCH_SIZE) {
          const batch = products.slice(i, i + BATCH_SIZE);
          
          // Processar cada produto no lote
          batch.forEach(product => {
            try {
              // Garantir que temos dados válidos
              if (!product || !product.id) {
                console.warn('Produto inválido para indexação:', product);
                return;
              }
              
              // Debug do produto com "kit"
              if (product.name && product.name.toLowerCase().includes('kit')) {
                console.log('Indexando produto com kit:', product);
              }
              
              // Extrair campos relevantes para indexação
              const doc = {
                id: product.id,
                name: (product.name || '').toLowerCase(),
                description: (product.description || product.short_description || '').toLowerCase(),
                category: (product.category || '').toLowerCase(),
                vendorName: (product.vendorName || '').toLowerCase(),
                // Campo combinado para melhorar a busca com termos curtos
                searchData: [
                  (product.name || ''),
                  (product.description || product.short_description || ''),
                  (product.category || ''),
                  (product.vendorName || ''),
                  (product.searchData || ''),
                  (product.tags || []).join(' ')
                ].join(' ').toLowerCase(),
                price: product.price,
                comparePrice: product.comparePrice,
                image: product.image || product.mainImage || product.main_image,
                slug: product.slug
              };
              
              // Adicionar ao índice FlexSearch Document
              if (this.flexSearch && typeof this.flexSearch.add === 'function') {
                this.flexSearch.add(doc);
              }
            } catch (err) {
              console.error('Erro ao indexar produto:', err, product);
            }
          });
          
          // Para evitar bloquear o navegador com muitos produtos
          if (i + BATCH_SIZE < products.length) {
            // Pequena pausa para permitir que a UI responda entre lotes
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }
        
        console.log("FlexSearch indexou", products.length, "produtos com sucesso");
        
        // Armazenar produtos completos para acesso rápido
        this.products = products;
        
        // Extrair categorias únicas para filtros rápidos
        this.extractCategories();
        
        this.loading = false;
      } catch (error) {
        console.error('Erro ao carregar produtos para busca:', error);
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
        // Removendo campos desnecessários para economizar espaço
        const optimizedData = {
          success: true,
          products: data.products.map(p => ({
            id: p.id,
            name: p.name,
            description: p.short_description || '',
            price: p.price,
            comparePrice: p.compare_at_price || p.comparePrice,
            image: p.mainImage || p.main_image || p.image,
            slug: p.slug || p.id,
            vendorName: p.vendor_name || p.vendorName || '',
            category: p.category_name || p.category || '',
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
      
      // Alterado para permitir termos curtos (como "kit")
      if (!term || term.length < 1) {
        this.results = [];
        this.categories = [];
        this.suggestions = [];
        this.showResults = false;
        return;
      }
      
      // Verificar se FlexSearch foi inicializado
      if (!this.flexSearch) {
        console.warn("FlexSearch não foi inicializado ainda, tentando inicializar");
        await this.initFlexSearch();
        // Se ainda não estiver inicializado após a tentativa, retornar
        if (!this.flexSearch) {
          console.error("Falha ao inicializar FlexSearch");
          this.results = [];
          this.categories = [];
          this.suggestions = [];
          this.showResults = false;
          return;
        }
      }
      
      this.loading = true;
      this.showResults = true;
      
      try {
        // Busca avançada com FlexSearch.Document
        const searchTerm = term.toLowerCase();
        console.log("Buscando por:", searchTerm);
        
        // Método simplificado: Use fallback para garantir resultados
      
      // 1. Pesquisa direta nos dados - abordagem muito confiável para termos curtos
      const directResults = this.products.filter(product => {
        if (!product || !product.name) return false;
        
        // Busca em todos os campos relevantes
        const searchableText = [
          product.name,
          product.description || product.short_description || '',
          product.category || '',
          product.vendorName || product.vendor_name || '',
          product.searchData || ''
        ].join(' ').toLowerCase();
        
        // Para termos curtos como "kit", verificamos várias condições
        return (
          // Correspondência exata no nome (mais relevante)
          product.name.toLowerCase() === searchTerm ||
          // Palavra no início do nome (como "Kit Enxoval")
          product.name.toLowerCase().startsWith(searchTerm) ||
          // Palavra no nome (como "Super Kit de Beleza")
          product.name.toLowerCase().includes(` ${searchTerm} `) ||
          // Em qualquer lugar do nome
          product.name.toLowerCase().includes(searchTerm) ||
          // Em qualquer campo de texto
          searchableText.includes(searchTerm)
        );
      });
      
      console.log(`Busca direta encontrou ${directResults.length} produtos com '${searchTerm}'`);
      if (directResults.length > 0) {
        console.log('Exemplos:', directResults.slice(0, 2).map(p => p.name));
      }
      
      // 2. Pesquisa via FlexSearch para termos mais complexos
      const resultsByField = {};
      const fields = ['name', 'searchData']; // Simplificado para maior eficiência
      
      try {
        // Configuração simplificada, focando apenas no essencial
        const searchConfig = {
          limit: 100,       // Limite alto para garantir resultados
          suggest: true,    // Ativar sugestões
          enrich: true,     // Incluir documento completo
          bool: 'or',       // Operador OR para combinar termos
          fuzzy: 0.4        // Alta tolerância a erros
        };
        
        // Buscar apenas nos campos principais
        for (const field of fields) {
          try {
            resultsByField[field] = await this.flexSearch.search(field, searchTerm, searchConfig);
          } catch (err) {
            console.error(`Erro na busca FlexSearch (${field}):`, err);
            resultsByField[field] = [];
          }
        }
      } catch (err) {
        console.error('Erro geral na busca FlexSearch:', err);
      }
        
        // Combinar resultados das duas abordagens
        let scoredResults = [];
        
        // 1. Adicionar resultados FlexSearch se disponíveis
        try {
          const flexResults = this.combineSearchResults(resultsByField, searchTerm);
          if (flexResults && flexResults.length > 0) {
            console.log(`FlexSearch encontrou ${flexResults.length} resultados`);
            scoredResults = flexResults;
          }
        } catch (err) {
          console.error('Erro ao processar resultados FlexSearch:', err);
        }
        
        // 2. Usar resultados diretos se FlexSearch não encontrou nada ou encontrou poucos resultados
        if (scoredResults.length === 0 && directResults.length > 0) {
          console.log("Usando resultados da busca direta");
          scoredResults = directResults.map(product => ({
            ...product,
            _score: 100 // Score alto para resultados diretos
          }));
        }
        // Se temos poucos resultados do FlexSearch, complementar com a busca direta
        else if (scoredResults.length < 3 && directResults.length > scoredResults.length) {
          console.log("Complementando resultados do FlexSearch com a busca direta");
          
          // Obter IDs já presentes para evitar duplicatas
          const existingIds = new Set(scoredResults.map(p => p.id));
          
          // Adicionar apenas resultados não duplicados
          const additionalResults = directResults
            .filter(product => !existingIds.has(product.id))
            .map(product => ({
              ...product,
              _score: 80 // Score um pouco menor para resultados complementares
            }));
            
          scoredResults = [...scoredResults, ...additionalResults];
        }
        
        console.log("FlexSearch encontrou", scoredResults.length, "resultados com scoring");
        
        // Processar categorias dos resultados
        const categoriesMap = this.getCategoriesFromResults(scoredResults);
        
        // Obter as categorias mais relevantes
        this.categories = Array.from(categoriesMap.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 3);
        
        // Gerar sugestões de busca inteligentes baseadas nos resultados
        this.suggestions = this.generateSearchSuggestions(scoredResults, searchTerm);
        
        // Aplicar correção de termos mal digitados
        if (scoredResults.length < 3 && term.length > 3) {
          const correctedTerm = this.getSpellingSuggestion(term);
          if (correctedTerm && correctedTerm !== term) {
            // Adicionar a correção às sugestões
            this.suggestions.unshift(correctedTerm);
          }
        }
        
        // Limitar os resultados finais para a visualização instantânea
        this.results = scoredResults.slice(0, 6);
        
        // Manter histórico
        this.hasSearched = true;
        
        // Adicionar termo às buscas recentes se houver resultados
        if (this.results.length > 0) {
          this.addToRecentSearches(term);
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
     * Combina resultados de diferentes campos com scoring de relevância
     * @param {Object} resultsByField - Resultados por campo
     * @param {string} searchTerm - Termo de busca
     * @returns {Array} Resultados ordenados por relevância
     */
    combineSearchResults(resultsByField, searchTerm) {
      // Mapa para armazenar pontuações combinadas por ID
      const scoreMap = new Map();
      const productsMap = new Map();
      
      // Pesos por campo para cálculo da relevância
      const fieldWeights = {
        name: 5,         // Peso maior para correspondências no nome
        description: 3,  // Peso médio para descrições
        category: 3,     // Peso médio para categorias
        vendorName: 2,   // Peso menor para fornecedor
        searchData: 1    // Peso menor para dados gerais
      };
      
      // Processar resultados de cada campo
      Object.entries(resultsByField).forEach(([field, results]) => {
        const weight = fieldWeights[field] || 1;
        
        // Processar resultados deste campo
        results.forEach(result => {
          // Cada resultado tem um array 'result' com documentos
          result.result.forEach(doc => {
            const id = doc.id;
            const product = doc.doc;
            
            // Armazenar o produto completo
            if (!productsMap.has(id)) {
              // Encontrar o produto original com todos os dados
              const fullProduct = this.products.find(p => p.id.toString() === id.toString());
              if (fullProduct) {
                productsMap.set(id, fullProduct);
              } else {
                productsMap.set(id, product);
              }
            }
            
            // Calcular score adicional baseado na qualidade da correspondência
            let extraScore = 0;
            
            // Bônus para correspondências exatas no nome
            if (field === 'name') {
              const productName = (product.name || '').toLowerCase();
              
              // Correspondência exata ganha bônus máximo
              if (productName === searchTerm) {
                extraScore += 50;
              }
              // Correspondência no início do nome
              else if (productName.startsWith(searchTerm)) {
                extraScore += 30;
              }
              // Correspondência em uma palavra completa
              else if (new RegExp(`\\b${searchTerm}\\b`).test(productName)) {
                extraScore += 20;
              }
              // Correspondência parcial
              else if (productName.includes(searchTerm)) {
                extraScore += 10;
              }
            }
            
            // Adicionar à pontuação total
            const currentScore = scoreMap.get(id) || 0;
            scoreMap.set(id, currentScore + (weight * 10) + extraScore);
          });
        });
      });
      
      // Converter mapa para array e ordenar por pontuação
      const scoredResults = Array.from(productsMap.entries())
        .map(([id, product]) => ({
          ...product,
          _score: scoreMap.get(id) || 0
        }))
        .sort((a, b) => b._score - a._score);
      
      return scoredResults;
    },
    
    /**
     * Extrai categorias dos resultados da busca
     * @param {Array} results - Resultados da busca
     * @returns {Map} Mapa de categorias com contagens
     */
    getCategoriesFromResults(results) {
      // Mapa para contar produtos por categoria
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
      
      return categoriesMap;
    },
    
    /**
     * Gera sugestões de busca inteligentes
     * @param {Array} results - Resultados da busca
     * @param {string} searchTerm - Termo de busca original
     * @returns {Array} Sugestões de busca
     */
    generateSearchSuggestions(results, searchTerm) {
      // Extrair termos candidatos dos resultados
      let candidates = [];
      
      // Extrair dos nomes dos produtos
      results.slice(0, 10).forEach(product => {
        // Dividir nome em palavras
        const words = (product.name || '').split(/\s+/);
        
        // Para cada palavra/frase no nome
        if (words.length > 1) {
          // Adicionar palavras individuais que incluem o termo de busca
          const matchedParts = words.filter(word => 
            word.toLowerCase().includes(searchTerm)
          );
          
          candidates.push(...matchedParts);
          
          // Adicionar combinações de duas palavras
          for (let i = 0; i < words.length - 1; i++) {
            candidates.push(`${words[i]} ${words[i + 1]}`);
          }
          
          // Adicionar nome completo se for curto
          if (product.name.length < 30) {
            candidates.push(product.name);
          }
        } else if (words.length === 1) {
          candidates.push(product.name);
        }
        
        // Adicionar categoria se relevante
        if (product.category && product.category.toLowerCase().includes(searchTerm)) {
          candidates.push(product.category);
        }
      });
      
      // Preservar versões originais (com acentuação) dos candidatos
      const originalCandidates = candidates.slice();
      
      // Limpar e normalizar candidatos
      candidates = candidates
        .map(term => term.trim())
        .filter(term => term.length > 0 && term.length < 50);
      
      // Agrupar termos similares e contar ocorrências
      const termCounts = {};
      const originalTerms = {}; // Mapear versões normalizadas para originais
      
      candidates.forEach(term => {
        const normalizedTerm = term.toLowerCase();
        
        // Incrementar contagem
        termCounts[normalizedTerm] = (termCounts[normalizedTerm] || 0) + 1;
        
        // Guardar versão original com acentuação
        if (!originalTerms[normalizedTerm] || term.length < originalTerms[normalizedTerm].length) {
          originalTerms[normalizedTerm] = term;
        }
      });
      
      // Ordenar por contagem e depois por comprimento (preferindo mais curtos)
      const sortedTerms = Object.keys(termCounts)
        .sort((a, b) => {
          // Primeiro por contagem
          const countDiff = termCounts[b] - termCounts[a];
          if (countDiff !== 0) return countDiff;
          
          // Depois por comprimento (mais curtos primeiro)
          return a.length - b.length;
        });
      
      // Filtrar termos muito similares ao termo de busca
      return sortedTerms
        .filter(term => term !== searchTerm.toLowerCase())
        .slice(0, 3)
        .map(term => {
          // Usar a versão original (com acentuação) que guardamos
          const originalTerm = originalTerms[term] || term;
          
          // Se não temos versão original preservada, capitalizar a primeira letra
          if (originalTerm === term) {
            return term.split(/\s+/).map(word => {
              // Capitalizar preservando acentos - pegando primeiro caractere e resto da string
              if (word.length > 0) {
                return word.charAt(0).toUpperCase() + word.slice(1);
              }
              return word;
            }).join(' ');
          }
          
          return originalTerm;
        });
    },
    
    /**
     * Sugere correções para termos mal digitados
     * @param {string} term - Termo de busca com possível erro
     * @returns {string|null} Sugestão corrigida ou null
     */
    getSpellingSuggestion(term) {
      // Implementação simples de correção por distância de edição
      const normalizedTerm = term.toLowerCase();
      
      // Considerar apenas produtos com nome próximo ao termo buscado
      const candidates = this.products
        .filter(p => p.name && p.name.length >= term.length / 2)  // Filtrar nomes muito curtos
        .map(p => {
          const name = p.name.toLowerCase();
          // Calcular similaridade com o nome completo
          const nameSimilarity = this.calculateSimilarity(normalizedTerm, name);
          
          // Calcular também similaridade com palavras individuais do nome
          const words = name.split(/\s+/);
          let wordSimilarity = 0;
          
          words.forEach(word => {
            if (word.length >= 3) {  // Ignorar palavras muito curtas
              const similarity = this.calculateSimilarity(normalizedTerm, word);
              wordSimilarity = Math.max(wordSimilarity, similarity);
            }
          });
          
          // Retornar o máximo das duas similaridades
          return {
            term: p.name,
            similarity: Math.max(nameSimilarity, wordSimilarity)
          };
        })
        .filter(c => c.similarity > 0.7)  // Filtrar apenas termos suficientemente similares
        .sort((a, b) => b.similarity - a.similarity);
      
      // Retornar o melhor candidato, se houver
      return candidates.length > 0 ? candidates[0].term : null;
    },
    
    /**
     * Calcula similaridade entre duas strings (0-1)
     * @param {string} a - Primeira string
     * @param {string} b - Segunda string
     * @returns {number} Similaridade entre 0 e 1
     */
    calculateSimilarity(a, b) {
      // Implementação simples de similaridade por distância de edição normalizada
      if (a === b) return 1.0;  // Correspondência exata
      if (a.length === 0 || b.length === 0) return 0.0;  // Uma string vazia
      
      // Verificar se uma é substring da outra
      if (a.includes(b) || b.includes(a)) {
        const minLength = Math.min(a.length, b.length);
        const maxLength = Math.max(a.length, b.length);
        return minLength / maxLength;
      }
      
      // Verificar prefixo comum (útil para autocompletar)
      let commonPrefixLength = 0;
      const minLength = Math.min(a.length, b.length);
      
      for (let i = 0; i < minLength; i++) {
        if (a[i] === b[i]) {
          commonPrefixLength++;
        } else {
          break;
        }
      }
      
      if (commonPrefixLength > 2) {  // Prefixo significativo
        return commonPrefixLength / Math.max(a.length, b.length);
      }
      
      // Distância de Levenshtein simplificada para casos onde não há prefixo comum
      let distance = 0;
      const aChars = a.split('');
      const bChars = b.split('');
      
      // Calcular diferenças de caracteres (simplificado)
      const uniqueCharsA = new Set(aChars);
      const uniqueCharsB = new Set(bChars);
      
      let commonChars = 0;
      uniqueCharsA.forEach(char => {
        if (uniqueCharsB.has(char)) commonChars++;
      });
      
      const totalUniqueChars = uniqueCharsA.size + uniqueCharsB.size - commonChars;
      
      return commonChars / totalUniqueChars;
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
        
        // Buscar via Astro API usando path absoluto
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
      if (!term || term.trim().length < 2) return;
      
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
    }
  });
});