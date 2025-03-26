/**
 * Cart Store
 * 
 * Alpine.js store for managing the shopping cart with multi-vendor support.
 */
document.addEventListener('alpine:init', () => {
  Alpine.store('cart', {
    items: [],
    count: 0, // Cache para contagem total de itens no carrinho
    
    init() {
      // Load saved cart from localStorage on initialization
      const savedCart = localStorage.getItem('cart');
      if (savedCart) {
        this.items = JSON.parse(savedCart);
        // Atualiza contagem de itens ao inicializar
        this.count = this.items.reduce((total, item) => total + item.quantity, 0);
      }
      
      // Save cart to localStorage whenever it changes
      this.$watch('items', () => {
        localStorage.setItem('cart', JSON.stringify(this.items));
        // Atualiza contagem de itens quando o carrinho muda
        this.count = this.items.reduce((total, item) => total + item.quantity, 0);
      });
    },
    
    /**
     * Add an item to the cart
     * @param {Object} product - The product to add
     * @param {number} quantity - Quantity to add (defaults to 1)
     */
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
      
      // Mostra mensagem de confirmação usando o sistema de toast
      window.dispatchEvent(new CustomEvent('toast', { 
        detail: { 
          message: `${product.name} adicionado ao carrinho`, 
          type: 'success' 
        }
      }));
    },
    
    /**
     * Remove an item from the cart
     * @param {string} id - Item ID to remove
     */
    removeItem(id) {
      this.items = this.items.filter(item => item.id !== id);
    },
    
    /**
     * Increase the quantity of an item
     * @param {string} id - Item ID
     */
    increaseQuantity(id) {
      const item = this.items.find(item => item.id === id);
      if (item) {
        item.quantity += 1;
      }
    },
    
    /**
     * Decrease the quantity of an item (removes if quantity would be 0)
     * @param {string} id - Item ID
     */
    decreaseQuantity(id) {
      const item = this.items.find(item => item.id === id);
      if (item && item.quantity > 1) {
        item.quantity -= 1;
      } else if (item) {
        this.removeItem(id);
      }
    },
    
    /**
     * Group items by vendor (for multi-vendor checkout)
     * @returns {Object} Items grouped by vendorId
     */
    getItemsByVendor() {
      return this.items.reduce((acc, item) => {
        const vendorId = item.vendorId || 'default';
        if (!acc[vendorId]) {
          acc[vendorId] = [];
        }
        acc[vendorId].push(item);
        return acc;
      }, {});
    },
    
    /**
     * Get total number of items in cart
     */
    get itemCount() {
      return this.count;
    },
    
    /**
     * Get total price of all items in cart
     */
    get total() {
      return this.items.reduce((total, item) => total + (item.price * item.quantity), 0);
    },
    
    /**
     * Get subtotals by vendor (for multi-vendor checkout)
     */
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
    
    /**
     * Check if an item exists in the cart
     * @param {string} id - Product ID to check
     * @returns {boolean}
     */
    hasItem(id) {
      return this.items.some(item => item.id === id);
    },
    
    /**
     * Get a specific item from the cart
     * @param {string} id - Product ID to retrieve
     * @returns {Object|null} The cart item or null if not found
     */
    getItem(id) {
      return this.items.find(item => item.id === id) || null;
    },
    
    /**
     * Clear the cart completely
     */
    clear() {
      this.items = [];
    }
  });
});