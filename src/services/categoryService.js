// Serviço para acesso a dados de categorias
import Database from 'better-sqlite3';

// Criar conexão com o banco de dados SQLite
const db = new Database("./marketplace.db", { readonly: true });

// Links estáticos do menu
const STATIC_MENU_LINKS = [
  {
    name: "Home",
    url: "/",
    highlight: false
  },
  {
    name: "Ofertas",
    url: "/ofertas",
    highlight: true
  },
  {
    name: "Novidades",
    url: "/novidades",
    highlight: false
  },
  {
    name: "Blog",
    url: "/blog",
    highlight: false
  },
  {
    name: "Contato",
    url: "/contato",
    highlight: false
  }
];

/**
 * Serviço de acesso a dados para categorias
 */
class CategoryService {
  /**
   * Retorna todas as categorias principais (sem parent_id)
   * @returns {Array} Lista de categorias principais
   */
  getMainCategories() {
    const stmt = db.prepare(`
      SELECT c.*, ci.cid 
      FROM categories c
      LEFT JOIN category_identifiers ci ON c.id = ci.category_id
      WHERE c.parent_id IS NULL AND c.is_active = 1
      ORDER BY c.display_order ASC, c.name ASC
    `);
    
    return stmt.all();
  }
  
  /**
   * Retorna todas as subcategorias de uma categoria específica
   * @param {number} parentId - ID da categoria pai
   * @returns {Array} Lista de subcategorias
   */
  getSubcategories(parentId) {
    const stmt = db.prepare(`
      SELECT c.*, ci.cid 
      FROM categories c
      LEFT JOIN category_identifiers ci ON c.id = ci.category_id
      WHERE c.parent_id = ? AND c.is_active = 1
      ORDER BY c.display_order ASC, c.name ASC
    `);
    
    return stmt.all(parentId);
  }
  
  /**
   * Retorna a árvore completa de categorias (categorias principais com suas subcategorias)
   * @returns {Array} Árvore de categorias
   */
  getCategoryTree() {
    const mainCategories = this.getMainCategories();
    
    // Para cada categoria principal, buscar suas subcategorias
    return mainCategories.map(category => {
      const subcategories = this.getSubcategories(category.id);
      return {
        ...category,
        subcategories
      };
    });
  }
  
  /**
   * Busca uma categoria pelo seu CID (identificador único)
   * @param {string} cid - O CID da categoria
   * @returns {Object|null} Categoria encontrada ou null
   */
  getCategoryByCid(cid) {
    const stmt = db.prepare(`
      SELECT c.*, ci.cid 
      FROM categories c
      JOIN category_identifiers ci ON c.id = ci.category_id
      WHERE ci.cid = ? AND c.is_active = 1
    `);
    
    return stmt.get(cid);
  }
  
  /**
   * Constrói um menu completo com categorias e subcategorias
   * @returns {Object} Menu completo para a navegação
   */
  getMenuWithCategories() {
    const categoryTree = this.getCategoryTree();
    
    // Transformar a árvore de categorias em formato adequado para menu
    return {
      categories: categoryTree,
      staticLinks: STATIC_MENU_LINKS
    };
  }
  
  /**
   * Retorna todas as categorias ativas (que têm produtos)
   * @returns {Array} Lista de categorias ativas
   */
  getActiveCategories() {
    const stmt = db.prepare(`
      SELECT c.*, ci.cid, COUNT(p.id) as product_count 
      FROM categories c
      LEFT JOIN category_identifiers ci ON c.id = ci.category_id
      JOIN products p ON c.id = p.category_id
      WHERE c.is_active = 1 AND p.is_active = 1
      GROUP BY c.id
      HAVING product_count > 0
      ORDER BY c.display_order ASC, c.name ASC
    `);
    
    return stmt.all();
  }
}

// Exportar uma instância do serviço para uso em toda a aplicação
const categoryService = new CategoryService();
export default categoryService;