/**
 * Search Store
 * 
 * Alpine.js store for managing search functionality with FlexSearch.
 */
document.addEventListener('alpine:init', () => {
  Alpine.store('search', {
    results: [],
    loading: false,
    showResults: false,
    flexSearch: null,
    products: [],
    
    init() {
      this.initFlexSearch();
    },
    
    /**
     * Initialize FlexSearch library
     */
    async initFlexSearch() {
      try {
        // Dynamically import FlexSearch
        const FlexSearch = await import('flexsearch');
        
        // Configure the search index
        this.flexSearch = new FlexSearch.Index({
          tokenize: "forward",
          resolution: 9,
          language: "pt"
        });
        
        // Load products and create search index
        this.loadProducts();
      } catch (error) {
        console.error('Error initializing FlexSearch:', error);
      }
    },
    
    /**
     * Load products from API and add to search index
     */
    async loadProducts() {
      try {
        this.loading = true;
        
        // This would be replaced with a real API call in production
        // For now, we'll simulate a response with mock data
        const mockProducts = [
          {
            id: '1',
            name: 'Berço Montessoriano',
            description: 'Berço montessoriano em madeira natural',
            price: 899.90,
            image: 'https://via.placeholder.com/300x300?text=Berço',
            vendorName: 'Móveis Infantis Ltda',
            vendorId: 'vendor1',
            categories: ['quarto', 'berço', 'montessoriano']
          },
          {
            id: '2',
            name: 'Kit Enxoval Completo',
            description: 'Kit enxoval com 20 peças para bebê',
            price: 349.90,
            image: 'https://via.placeholder.com/300x300?text=Enxoval',
            vendorName: 'Baby Shop',
            vendorId: 'vendor2',
            categories: ['enxoval', 'roupa', 'kit']
          },
          {
            id: '3',
            name: 'Mobile Musical',
            description: 'Mobile musical para berço com estrelas e lua',
            price: 129.90,
            image: 'https://via.placeholder.com/300x300?text=Mobile',
            vendorName: 'Toys for Baby',
            vendorId: 'vendor3',
            categories: ['brinquedo', 'mobile', 'musical']
          }
        ];

        // In a real implementation, this would be fetched from an API:
        // const response = await fetch('/api/products/search-index');
        // const products = await response.json();
        const products = mockProducts;
        
        // Add products to search index
        products.forEach((product, index) => {
          const searchText = `${product.name} ${product.description} ${product.vendorName} ${product.categories.join(' ')}`;
          this.flexSearch.add(index, searchText);
          product.searchIndex = index;
        });
        
        this.products = products;
        this.loading = false;
      } catch (error) {
        console.error('Error loading products for search:', error);
        this.loading = false;
      }
    },
    
    /**
     * Perform a search query
     * @param {string} term - Search term
     */
    query(term) {
      if (!term || term.length < 2 || !this.flexSearch) {
        this.results = [];
        return;
      }
      
      this.loading = true;
      
      // Execute the search
      const searchResults = this.flexSearch.search(term);
      
      // Map search results to products
      this.results = searchResults
        .map(index => this.products.find(p => p.searchIndex === index))
        .filter(Boolean)
        .slice(0, 5);
        
      this.loading = false;
    }
  });
});