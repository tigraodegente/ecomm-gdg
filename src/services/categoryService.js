// Serviço para acesso a dados de categorias
import Database from 'better-sqlite3';

// Criar conexão com o banco de dados SQLite
const db = new Database("./marketplace.db", { readonly: true });

// Links estáticos do menu
const STATIC_MENU_LINKS = [
  {
    name: "Todos os Produtos",
    url: "/produtos",
    highlight: false
  },
  {
    name: "Alimentação",
    url: "/produtos/alimentacao",
    highlight: false
  },
  {
    name: "Berços",
    url: "/produtos/bercos",
    highlight: false
  },
  {
    name: "Acessórios para berço",
    url: "/produtos/acessorios-berco",
    highlight: false
  },
  {
    name: "Lençóis",
    url: "/produtos/lencois",
    highlight: false
  },
  {
    name: "Brinquedos para Bebês",
    url: "/produtos/brinquedos",
    highlight: false
  },
  {
    name: "Ofertas",
    url: "/ofertas",
    highlight: true
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
    
    const categories = stmt.all();
    console.log('Categorias carregadas do banco:', categories.map(c => `${c.name} (ordem: ${c.display_order})`));
    return categories;
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
    // Obter categorias do banco, já ordenadas pelo campo display_order
    const categoryTree = this.getCategoryTree();
    
    // Adicionar categoria "Todos os Produtos" como primeira opção
    const orderedCategories = [
      {
        id: 0,
        name: "Todos os Produtos",
        cid: "todos-produtos", 
        url: "/produtos",
        subcategories: []
      },
      ...categoryTree
    ];
    
    // Links fixos após as categorias
    const staticLinks = [
      { name: 'Ofertas', url: '/ofertas', highlight: true },
      { name: 'Blog', url: '/blog', highlight: false },
      { name: 'Contato', url: '/contato', highlight: false }
    ];
    
    return {
      categories: orderedCategories,
      staticLinks: staticLinks
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