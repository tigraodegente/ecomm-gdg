/**
 * Wishlist Store
 * 
 * Alpine.js store for managing the user's wishlist.
 */
document.addEventListener('alpine:init', () => {
  Alpine.store('wishlist', {
    items: [],
    
    init() {
      // Load saved wishlist from localStorage on initialization
      const savedWishlist = localStorage.getItem('wishlist');
      if (savedWishlist) {
        this.items = JSON.parse(savedWishlist);
      }
      
      // Save wishlist to localStorage whenever it changes
      this.$watch('items', () => {
        localStorage.setItem('wishlist', JSON.stringify(this.items));
      });
    },
    
    /**
     * Check if an item is in the wishlist
     * @param {string} id - Product ID to check
     * @returns {boolean}
     */
    has(id) {
      return this.items.includes(id);
    },
    
    /**
     * Add an item to the wishlist
     * @param {string} id - Product ID to add
     */
    add(id) {
      if (!this.has(id)) {
        this.items.push(id);
      }
    },
    
    /**
     * Remove an item from the wishlist
     * @param {string} id - Product ID to remove
     */
    remove(id) {
      this.items = this.items.filter(item => item !== id);
    },
    
    /**
     * Toggle an item in the wishlist (add if not present, remove if present)
     * @param {string} id - Product ID to toggle
     */
    toggle(id) {
      if (this.has(id)) {
        this.remove(id);
      } else {
        this.add(id);
      }
    },
    
    /**
     * Clear the wishlist completely
     */
    clear() {
      this.items = [];
    }
  });
});