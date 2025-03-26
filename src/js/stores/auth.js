/**
 * Auth Store
 * 
 * Alpine.js store for managing user authentication state.
 */
document.addEventListener('alpine:init', () => {
  Alpine.store('auth', {
    user: null,
    isAuthenticated: false,
    isLoading: true,
    
    init() {
      // Check if user is already logged in
      this.checkAuthState();
    },
    
    /**
     * Check current authentication state
     */
    async checkAuthState() {
      this.isLoading = true;
      
      try {
        // This would be a real API call in production
        // const response = await fetch('/api/auth/me');
        // if (response.ok) {
        //   const user = await response.json();
        //   this.setUser(user);
        // } else {
        //   this.logout();
        // }
        
        // For development/demo purposes, check localStorage
        const savedAuth = localStorage.getItem('auth');
        if (savedAuth) {
          const user = JSON.parse(savedAuth);
          this.setUser(user);
        } else {
          this.logout();
        }
      } catch (error) {
        console.error('Error checking auth state:', error);
        this.logout();
      } finally {
        this.isLoading = false;
      }
    },
    
    /**
     * Set current user and authentication state
     * @param {Object} user - User data
     */
    setUser(user) {
      this.user = user;
      this.isAuthenticated = true;
      localStorage.setItem('auth', JSON.stringify(user));
    },
    
    /**
     * Log the user out
     */
    logout() {
      this.user = null;
      this.isAuthenticated = false;
      localStorage.removeItem('auth');
      
      // In production, you'd call an API endpoint
      // fetch('/api/auth/logout', { method: 'POST' });
    },
    
    /**
     * Check if the user has a specific role
     * @param {string} role - Role to check for
     * @returns {boolean}
     */
    hasRole(role) {
      if (!this.isAuthenticated || !this.user) return false;
      return this.user.roles?.includes(role) || false;
    },
    
    /**
     * Check if the user is a vendor
     * @returns {boolean}
     */
    isVendor() {
      return this.hasRole('vendor');
    },
    
    /**
     * Check if the user is an admin
     * @returns {boolean}
     */
    isAdmin() {
      return this.hasRole('admin');
    }
  });
});