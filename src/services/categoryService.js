// Serviço para acesso a dados de categorias
import Database from 'better-sqlite3';

// Criar conexão com o banco de dados SQLite
const db = new Database("./marketplace.db", { readonly: true });

// LINKS ESTÁTICOS REMOVIDOS - Agora usamos apenas os dados do banco

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
    console.log('=== CATEGORIAS CARREGADAS DO BANCO (com ordem correta) ===');
    console.log(categories.map(c => `${c.name} (ordem: ${c.display_order})`).join('\n'));
    console.log('===========================================================');
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
    
    console.log('=== CATEGORIAS PRINCIPAIS ANTES DE PROCESSAR SUB-CATEGORIAS ===');
    console.log(mainCategories.map(c => `${c.name} (ordem: ${c.display_order})`).join('\n'));
    
    // Para cada categoria principal, buscar suas subcategorias
    const result = mainCategories.map(category => {
      const subcategories = this.getSubcategories(category.id);
      return {
        ...category,
        subcategories
      };
    });
    
    // Garantir que a ordenação está correta mesmo após processar as subcategorias
    result.sort((a, b) => (a.display_order || 999) - (b.display_order || 999));
    
    console.log('=== CATEGORIAS APÓS PROCESSAR SUB-CATEGORIAS (VERIFICAR ORDEM) ===');
    console.log(result.map(c => `${c.name} (ordem: ${c.display_order})`).join('\n'));
    
    return result;
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
    let categoryTree = this.getCategoryTree();
    
    // Garantir que as categorias estejam ordenadas explicitamente por display_order
    categoryTree = categoryTree.sort((a, b) => {
      const orderA = a.display_order || 999;
      const orderB = b.display_order || 999;
      return orderA - orderB;
    });
    
    console.log('=== MENU DE CATEGORIAS APÓS ORDENAÇÃO EXPLÍCITA ===');
    console.log(categoryTree.map(c => `${c.name} (ordem: ${c.display_order})`).join('\n'));
    
    // Adicionar categoria "Todos os Produtos" como primeira opção
    const orderedCategories = [
      {
        id: 0,
        name: "Todos os Produtos",
        cid: "todos-produtos", 
        url: "/produtos",
        subcategories: [],
        display_order: 0
      },
      ...categoryTree
    ];
    
    console.log('=== CATEGORIAS FINAIS EM ORDEM (com ordem explícita garantida) ===');
    console.log(orderedCategories.map(c => `${c.name} (ordem: ${c.display_order || 0})`).join('\n'));
    console.log('===========================================================');
    
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
    
    const categories = stmt.all();
    console.log('Categorias ativas ordenadas por display_order:', categories.map(c => `${c.name} (ordem: ${c.display_order})`));
    return categories;
  }
}

// Exportar uma instância do serviço para uso em toda a aplicação
const categoryService = new CategoryService();
export default categoryService;