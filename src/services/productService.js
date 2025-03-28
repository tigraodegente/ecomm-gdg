/**
 * Serviço unificado para acesso a dados de produtos
 * 
 * Este serviço implementa um padrão adaptador que permite
 * funcionar com diferentes fontes de dados (SQLite local, Turso, etc)
 * com uma interface única e consistente.
 */
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import tursoClient from '../db/turso-client';

// Obter o diretório atual para paths absolutos
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Criar conexão com o banco de dados SQLite
// Usando path absoluto para garantir que o banco seja encontrado
const dbPath = resolve(__dirname, '../../marketplace.db');
console.log('Conectando ao banco de dados em:', dbPath);
const db = new Database(dbPath, { readonly: true });

/**
 * Adapter Factory para criar clientes de banco de dados
 */
export class DatabaseAdapterFactory {
  static create(type = 'sqlite') {
    switch (type) {
      case 'turso':
        return new TursoAdapter();
      case 'sqlite':
      default:
        return new SqliteAdapter(db);
    }
  }
}

/**
 * Adapter para SQLite (acesso síncrono)
 */
class SqliteAdapter {
  constructor(db) {
    this.db = db;
  }

  execute(query, params = []) {
    if (query.trim().toLowerCase().startsWith('select')) {
      const stmt = this.db.prepare(query);
      if (query.includes('count(') || query.includes('COUNT(')) {
        return stmt.get(...params);
      }
      return stmt.all(...params);
    } else {
      const stmt = this.db.prepare(query);
      return stmt.run(...params);
    }
  }

  // Método para compatibilidade com a interface assíncrona
  async executeAsync(query, params = []) {
    return Promise.resolve(this.execute(query, params));
  }
}

/**
 * Adapter para Turso (acesso assíncrono)
 */
class TursoAdapter {
  async executeAsync(query, params = []) {
    const result = await tursoClient.executeQuery(query, params);
    return result.rows || [];
  }

  // Método síncrono que lança erro (Turso é somente assíncrono)
  execute() {
    throw new Error('Turso adapter supports only async operations');
  }
}

/**
 * Serviço de acesso a dados para produtos
 */
class ProductService {
  constructor(adapter) {
    this.adapter = adapter;
    
    // Flag para indicar se estamos usando uma fonte de dados assíncrona
    this.isAsync = adapter instanceof TursoAdapter;
  }
  /**
   * Lista produtos com filtros e paginação
   * @param {Object} options - Opções de filtro e paginação
   * @returns {Object|Promise<Object>} Produtos e metadados da paginação (Promise se isAsync=true)
   */
  listProducts(options = {}) {
    if (this.isAsync) {
      return this.listProductsAsync(options);
    }
    
    const {
      categoryId,
      categoryIds,
      search,
      minPrice,
      maxPrice,
      sort = 'newest',
      page = 1,
      limit = 12,
      vendorId,
      featured,
      attributeFilters = {}
    } = options;
    
    // Cálculo do offset para paginação
    const offset = (page - 1) * limit;
    
    // Construir query base
    let query = `
      SELECT 
        p.id, p.name, p.short_description, p.price, p.compare_at_price,
        p.is_variable, p.slug, p.stock, p.sku, p.is_featured,
        c.id as category_id, c.name as category_name,
        ci.cid as category_cid
      FROM products p
      JOIN categories c ON p.category_id = c.id
      LEFT JOIN category_identifiers ci ON c.id = ci.category_id
      WHERE p.is_active = 1
    `;
    
    // Array para os parâmetros da query
    const params = [];
    
    // Filtro por categoria
    if (categoryId) {
      query += ` AND p.category_id = ?`;
      params.push(categoryId);
    }
    
    // Filtro por múltiplas categorias (lógica OR - produtos em qualquer uma das categorias selecionadas)
    if (categoryIds && categoryIds.length > 0) {
      query += ` AND p.category_id IN (${categoryIds.map(() => '?').join(',')})`;
      params.push(...categoryIds);
    }
    
    // Filtro por preço mínimo
    if (minPrice) {
      query += ` AND p.price >= ?`;
      params.push(minPrice);
    }
    
    // Filtro por preço máximo
    if (maxPrice) {
      query += ` AND p.price <= ?`;
      params.push(maxPrice);
    }
    
    // Filtro por vendedor
    if (vendorId) {
      query += ` AND p.vendor_id = ?`;
      params.push(vendorId);
    }
    
    // Filtro por produtos em destaque
    if (featured) {
      query += ` AND p.is_featured = 1`;
    }
    
    // Filtro por termo de busca
    if (search && search.trim() !== '') {
      query += ` AND (p.name LIKE ? OR p.description LIKE ? OR p.short_description LIKE ?)`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }
    
    // Aplicar filtros de atributos com lógica melhorada
    // Lógica OR dentro do mesmo tipo (mostra produtos com qualquer um dos valores selecionados)
    // Lógica AND entre tipos diferentes (produto precisa atender a todos os tipos de filtro)
    if (attributeFilters && Object.keys(attributeFilters).length > 0) {
      // Para cada tipo de atributo
      Object.entries(attributeFilters).forEach(([typeId, values]) => {
        if (values && values.length > 0) {
          // Subconsulta para encontrar produtos com este atributo
          // Usando IN para implementar OR entre valores do mesmo tipo
          query += ` AND p.id IN (
            SELECT pav.product_id 
            FROM product_attribute_values pav 
            WHERE pav.attribute_type_id = ? AND pav.value IN (${values.map(() => '?').join(',')})
          )`;
          
          params.push(typeId, ...values);
        }
      });
    }
    
    // Ordenação
    switch (sort) {
      case 'price_asc':
        query += ' ORDER BY p.price ASC';
        break;
      case 'price_desc':
        query += ' ORDER BY p.price DESC';
        break;
      case 'name_asc':
        query += ' ORDER BY p.name ASC';
        break;
      case 'name_desc':
        query += ' ORDER BY p.name DESC';
        break;
      case 'featured':
        query += ' ORDER BY p.is_featured DESC, p.id DESC';
        break;
      case 'newest':
      default:
        query += ' ORDER BY p.id DESC';
        break;
    }
    
    try {
      // Contar total de produtos (sem paginação)
      let countQuery = query.replace(/SELECT.*?FROM/s, 'SELECT COUNT(*) as total FROM');
      // Remover a cláusula ORDER BY se presente
      countQuery = countQuery.replace(/ORDER BY.*$/s, '');
      
      const countResult = this.adapter.execute(countQuery, params);
      const total = countResult ? countResult.total : 0;
      
      // Adicionar paginação à query original
      query += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);
      
      // Executar a query principal
      const products = this.adapter.execute(query, params);
      
      // Buscar imagens principais para cada produto
      const productsWithImages = products.map(product => {
        const imageQuery = `
          SELECT image_url, alt 
          FROM product_images 
          WHERE product_id = ? AND variant_id IS NULL 
          ORDER BY is_default DESC, display_order ASC 
          LIMIT 1
        `;
        
        const image = this.adapter.execute(imageQuery, [product.id])[0];
        
        return {
          ...product,
          mainImage: image ? image.image_url : null,
          imageAlt: image ? image.alt : product.name
        };
      });
      
      // Calcular total de páginas
      const totalPages = Math.ceil(total / limit);
      
      return {
        products: productsWithImages,
        pagination: {
          total,
          totalPages,
          currentPage: page,
          limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      };
    } catch (error) {
      console.error('Erro ao listar produtos:', error);
      // Em caso de erro, retornar lista vazia com paginação básica
      return {
        products: [],
        pagination: {
          total: 0,
          totalPages: 0,
          currentPage: page,
          limit,
          hasNextPage: false,
          hasPrevPage: false
        }
      };
    }
  }
  
  /**
   * Versão assíncrona do método listProducts
   * @param {Object} options - Opções de filtro e paginação
   * @returns {Promise<Object>} Produtos e metadados da paginação
   */
  async listProductsAsync(options = {}) {
    const {
      categoryId,
      categoryIds,
      search,
      minPrice,
      maxPrice,
      sort = 'newest',
      page = 1,
      limit = 12,
      vendorId,
      featured,
      attributeFilters = {}
    } = options;
    
    // Cálculo do offset para paginação
    const offset = (page - 1) * limit;
    
    // Construir query base - idêntica à versão síncrona
    let query = `
      SELECT 
        p.id, p.name, p.short_description, p.price, p.compare_at_price,
        p.is_variable, p.slug, p.stock, p.sku, p.is_featured,
        c.id as category_id, c.name as category_name,
        ci.cid as category_cid
      FROM products p
      JOIN categories c ON p.category_id = c.id
      LEFT JOIN category_identifiers ci ON c.id = ci.category_id
      WHERE p.is_active = 1
    `;
    
    // Array para os parâmetros da query
    const params = [];
    
    // Aplicar os mesmos filtros da versão síncrona
    if (categoryId) {
      query += ` AND p.category_id = ?`;
      params.push(categoryId);
    }
    
    if (categoryIds && categoryIds.length > 0) {
      query += ` AND p.category_id IN (${categoryIds.map(() => '?').join(',')})`;
      params.push(...categoryIds);
    }
    
    if (minPrice) {
      query += ` AND p.price >= ?`;
      params.push(minPrice);
    }
    
    if (maxPrice) {
      query += ` AND p.price <= ?`;
      params.push(maxPrice);
    }
    
    if (vendorId) {
      query += ` AND p.vendor_id = ?`;
      params.push(vendorId);
    }
    
    if (featured) {
      query += ` AND p.is_featured = 1`;
    }
    
    if (search && search.trim() !== '') {
      query += ` AND (p.name LIKE ? OR p.description LIKE ? OR p.short_description LIKE ?)`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }
    
    // Filtros de atributos
    if (attributeFilters && Object.keys(attributeFilters).length > 0) {
      Object.entries(attributeFilters).forEach(([typeId, values]) => {
        if (values && values.length > 0) {
          query += ` AND p.id IN (
            SELECT pav.product_id 
            FROM product_attribute_values pav 
            WHERE pav.attribute_type_id = ? AND pav.value IN (${values.map(() => '?').join(',')})
          )`;
          
          params.push(typeId, ...values);
        }
      });
    }
    
    // Ordenação
    switch (sort) {
      case 'price_asc':
        query += ' ORDER BY p.price ASC';
        break;
      case 'price_desc':
        query += ' ORDER BY p.price DESC';
        break;
      case 'name_asc':
        query += ' ORDER BY p.name ASC';
        break;
      case 'name_desc':
        query += ' ORDER BY p.name DESC';
        break;
      case 'featured':
        query += ' ORDER BY p.is_featured DESC, p.id DESC';
        break;
      case 'newest':
      default:
        query += ' ORDER BY p.id DESC';
        break;
    }
    
    try {
      // Contar total de produtos (sem paginação)
      let countQuery = query.replace(/SELECT.*?FROM/s, 'SELECT COUNT(*) as total FROM');
      countQuery = countQuery.replace(/ORDER BY.*$/s, '');
      
      const countResult = await this.adapter.executeAsync(countQuery, params);
      const total = countResult[0] ? countResult[0].total : 0;
      
      // Adicionar paginação à query original
      query += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);
      
      // Executar a query principal
      const products = await this.adapter.executeAsync(query, params);
      
      // Buscar imagens principais para cada produto - em paralelo para melhor performance
      const imageQueries = products.map(product => {
        const imageQuery = `
          SELECT image_url, alt 
          FROM product_images 
          WHERE product_id = ? AND variant_id IS NULL 
          ORDER BY is_default DESC, display_order ASC 
          LIMIT 1
        `;
        
        return this.adapter.executeAsync(imageQuery, [product.id])
          .then(images => {
            const image = images[0];
            return {
              ...product,
              mainImage: image ? image.image_url : null,
              imageAlt: image ? image.alt : product.name
            };
          });
      });
      
      const productsWithImages = await Promise.all(imageQueries);
      
      // Calcular total de páginas
      const totalPages = Math.ceil(total / limit);
      
      return {
        products: productsWithImages,
        pagination: {
          total,
          totalPages,
          currentPage: page,
          limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      };
    } catch (error) {
      console.error('Erro ao listar produtos:', error);
      return {
        products: [],
        pagination: {
          total: 0,
          totalPages: 0,
          currentPage: page,
          limit,
          hasNextPage: false,
          hasPrevPage: false
        }
      };
    }
  }

  /**
   * Busca um produto pelo ID ou slug
   * @param {number|string} idOrSlug - ID do produto ou slug
   * @param {boolean} bySlug - Se true, busca pelo slug em vez de ID
   * @returns {Object|Promise<Object>|null} Produto completo ou null se não encontrado
   */
  getProductById(idOrSlug, bySlug = false) {
    if (this.isAsync) {
      return this.getProductByIdAsync(idOrSlug, bySlug);
    }
    
    // Garantir que bySlug seja booleano
    bySlug = Boolean(bySlug);
    
    try {
      // Query base para buscar produto
      let query = `
        SELECT 
          p.*, 
          c.id as category_id, c.name as category_name,
          ci.cid as category_cid,
          v.id as vendor_id, v.shop_name as vendor_name,
          v.logo_url as vendor_logo, v.description as vendor_description
        FROM products p
        JOIN categories c ON p.category_id = c.id
        LEFT JOIN category_identifiers ci ON c.id = ci.category_id
        LEFT JOIN vendors v ON p.vendor_id = v.id
        WHERE p.is_active = 1 AND 
      `;
      
      // Condição de busca com base em slug ou ID
      query += bySlug ? 'p.slug = ?' : 'p.id = ?';
      
      // Executar a query
      const product = this.adapter.execute(query, [idOrSlug]);
      
      // Se não encontrar o produto
      if (!product || !product[0]) {
        return null;
      }
      
      const productData = product[0];
      
      // Enriquecer o produto com dados relacionados
      try {
        // Buscar imagens do produto
        const imagesQuery = `
          SELECT * 
          FROM product_images 
          WHERE product_id = ? AND variant_id IS NULL 
          ORDER BY is_default DESC, display_order ASC
        `;
        
        productData.images = this.adapter.execute(imagesQuery, [productData.id]);
        
        // Buscar atributos do produto
        const attributesQuery = `
          SELECT 
            pav.id, pav.value, pav.display_value,
            pat.id as type_id, pat.name as type_name, pat.display_name as type_display_name
          FROM product_attribute_values pav
          JOIN product_attribute_types pat ON pav.attribute_type_id = pat.id
          WHERE pav.product_id = ? AND pav.variant_id IS NULL
        `;
        
        productData.attributes = this.adapter.execute(attributesQuery, [productData.id]);
        
        return productData;
      } catch (error) {
        console.error('Erro ao buscar detalhes adicionais do produto:', error);
        // Retornar o produto básico mesmo sem detalhes
        return productData;
      }
    } catch (error) {
      console.error('Erro ao buscar produto:', error);
      return null;
    }
  }
  
  /**
   * Versão assíncrona do método getProductById
   * @param {number|string} idOrSlug - ID do produto ou slug
   * @param {boolean} bySlug - Se true, busca pelo slug em vez de ID
   * @returns {Promise<Object|null>} Produto completo ou null se não encontrado
   */
  async getProductByIdAsync(idOrSlug, bySlug = false) {
    // Garantir que bySlug seja booleano
    bySlug = Boolean(bySlug);
    
    try {
      // Query base para buscar produto - idêntica à versão síncrona
      let query = `
        SELECT 
          p.*, 
          c.id as category_id, c.name as category_name,
          ci.cid as category_cid,
          v.id as vendor_id, v.shop_name as vendor_name,
          v.logo_url as vendor_logo, v.description as vendor_description
        FROM products p
        JOIN categories c ON p.category_id = c.id
        LEFT JOIN category_identifiers ci ON c.id = ci.category_id
        LEFT JOIN vendors v ON p.vendor_id = v.id
        WHERE p.is_active = 1 AND 
      `;
      
      // Condição de busca com base em slug ou ID
      query += bySlug ? 'p.slug = ?' : 'p.id = ?';
      
      // Executar a query
      const products = await this.adapter.executeAsync(query, [idOrSlug]);
      
      // Se não encontrar o produto
      if (!products || products.length === 0) {
        return null;
      }
      
      const product = products[0];
      
      // Buscar imagens e atributos em paralelo para melhor performance
      const [images, attributes] = await Promise.all([
        // Buscar imagens do produto
        this.adapter.executeAsync(`
          SELECT * 
          FROM product_images 
          WHERE product_id = ? AND variant_id IS NULL 
          ORDER BY is_default DESC, display_order ASC
        `, [product.id]),
        
        // Buscar atributos do produto
        this.adapter.executeAsync(`
          SELECT 
            pav.id, pav.value, pav.display_value,
            pat.id as type_id, pat.name as type_name, pat.display_name as type_display_name
          FROM product_attribute_values pav
          JOIN product_attribute_types pat ON pav.attribute_type_id = pat.id
          WHERE pav.product_id = ? AND pav.variant_id IS NULL
        `, [product.id])
      ]);
      
      product.images = images;
      product.attributes = attributes;
      
      return product;
    } catch (error) {
      console.error('Erro ao buscar produto de forma assíncrona:', error);
      return null;
    }
  }
  
  /**
   * Obtém produtos relacionados a um produto específico
   * @param {number|string} productId - ID do produto
   * @returns {Array} Lista de produtos relacionados
   */
  getRelatedProducts(productId) {
    // Primeiro, obter a categoria do produto
    const product = this.getProductById(productId);
    if (!product) return [];
    
    try {
      // Buscar produtos da mesma categoria, excluindo o atual
      const query = `
        SELECT 
          p.id, p.name, p.price, p.slug, p.is_variable,
          (SELECT image_url FROM product_images 
           WHERE product_id = p.id ORDER BY is_default DESC, display_order ASC LIMIT 1) as main_image
        FROM products p
        WHERE p.category_id = ? AND p.id != ? AND p.is_active = 1
        ORDER BY RANDOM()
        LIMIT 4
      `;
      
      const stmt = db.prepare(query);
      return stmt.all(product.category_id, productId);
    } catch (error) {
      console.error('Erro ao buscar produtos relacionados:', error);
      return [];
    }
  }
  
  /**
   * Busca produtos por categoria
   * @param {number|string} categoryId - ID da categoria ou CID
   * @param {boolean} byCid - Se true, busca pelo CID em vez de ID
   * @param {Object} options - Opções de paginação e filtro
   * @returns {Object} Produtos e metadados da paginação
   */
  getProductsByCategoryId(categoryId, byCid = false, options = {}) {
    // Se buscar por CID, primeiro encontrar o ID da categoria
    if (byCid) {
      const getCategoryIdByCid = db.prepare(`
        SELECT c.id
        FROM categories c
        JOIN category_identifiers ci ON c.id = ci.category_id
        WHERE ci.cid = ?
      `);
      
      const category = getCategoryIdByCid.get(categoryId);
      if (!category) {
        return {
          products: [],
          pagination: {
            total: 0,
            page: 1,
            limit: options.limit || 12,
            totalPages: 0,
            hasNextPage: false,
            hasPrevPage: false
          }
        };
      }
      
      categoryId = category.id;
    }
    
    // Buscar também subcategorias da categoria (se houver)
    const getSubcategories = db.prepare(`
      SELECT id FROM categories WHERE parent_id = ?
    `);
    
    const subcategories = getSubcategories.all(categoryId);
    const categoryIds = [categoryId, ...subcategories.map(sc => sc.id)];
    
    // Usar o método listProducts com o filtro de categoria
    return this.listProducts({
      ...options,
      categoryIds
    });
  }
  
  /**
   * Busca produtos por termo de pesquisa
   * @param {string} term - Termo de busca
   * @param {Object} options - Opções adicionais (limite, página, filtros)
   * @returns {Object} Resultados da busca e dados para indexação
   */
  searchProducts(term, options = {}) {
    // Redirecionar para listProducts com o termo de busca
    return this.listProducts({
      ...options,
      search: term
    });
  }
  
  /**
   * Retorna as categorias com contagem de produtos com base nos filtros aplicados
   * @param {Object} options - Opções de filtro (preço, categorias, etc)
   * @returns {Array} Lista de categorias com contagem de produtos
   */
  getCategoriesWithProductCount(options = {}) {
    try {
      // Criar uma query para buscar categorias com contagem de produtos
      let query = `
        SELECT 
          c.id, c.name, c.display_order, ci.cid,
          COUNT(DISTINCT p.id) as product_count
        FROM categories c
        LEFT JOIN category_identifiers ci ON c.id = ci.category_id
        JOIN products p ON p.category_id = c.id
        WHERE c.is_active = 1 AND p.is_active = 1
      `;
      
      // Array para os parâmetros da query
      const params = [];
      
      // Adicionar filtros (similar ao listProducts)
      if (options.minPrice) {
        query += ` AND p.price >= ?`;
        params.push(options.minPrice);
      }
      
      if (options.maxPrice) {
        query += ` AND p.price <= ?`;
        params.push(options.maxPrice);
      }
      
      if (options.search) {
        query += ` AND (p.name LIKE ? OR p.description LIKE ? OR p.short_description LIKE ?)`;
        const searchTerm = `%${options.search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }
      
      // Finalizar query com group by e order by
      query += `
        GROUP BY c.id
        HAVING product_count > 0
        ORDER BY c.display_order ASC, c.name ASC
      `;
      
      // Executar a query
      const stmt = db.prepare(query);
      return stmt.all(...params);
    } catch (error) {
      console.error('Erro ao buscar categorias com contagem de produtos:', error);
      return [];
    }
  }
  
  // Métodos para obter dados para filtros
  getAttributeTypesForFilters() {
    try {
      const query = `
        SELECT id, name, display_name 
        FROM product_attribute_types 
        ORDER BY display_order
      `;
      
      const stmt = db.prepare(query);
      const result = stmt.all();
      return result;
    } catch (error) {
      console.error('Erro ao buscar tipos de atributos:', error);
      return [];
    }
  }
  
  getAttributeValuesForType(typeId, options = {}) {
    try {
      const query = `
        SELECT DISTINCT value, display_value 
        FROM product_attribute_values 
        WHERE attribute_type_id = ? 
        ORDER BY display_value
      `;
      
      const stmt = db.prepare(query);
      const results = stmt.all(typeId);
      
      // Para cada valor, adicionar uma contagem fictícia para não quebrar os filtros
      return results.map(result => ({
        ...result,
        product_count: 6  // Valor fictício para não quebrar a interface
      }));
    } catch (error) {
      console.error('Erro ao buscar valores de atributos:', error);
      return [];
    }
  }
  
  // Métodos específicos para tipos comuns de atributos
  getMaterialsForFilter(options = {}) {
    return this.getAttributeValuesForType(3, options); // ID do tipo "material"
  }
  
  getColorsForFilter(options = {}) {
    return this.getAttributeValuesForType(1, options); // ID do tipo "cor"
  }
  
  getSizesForFilter(options = {}) {
    return this.getAttributeValuesForType(2, options); // ID do tipo "tamanho"
  }
  
  getPriceRangesForProducts(options = {}) {
    try {
      // Obter valor mínimo e máximo dos produtos
      const query = `
        SELECT 
          MIN(price) as min_price, 
          MAX(price) as max_price 
        FROM products 
        WHERE is_active = 1
      `;
      
      const stmt = db.prepare(query);
      const result = stmt.get();
      
      if (!result) return [];
      
      const { min_price, max_price } = result;
      
      // Criar faixas de preço (dividir em 4 segmentos)
      const range = max_price - min_price;
      const step = range / 4;
      
      return [
        { min: min_price, max: min_price + step, count: 0 },
        { min: min_price + step, max: min_price + step * 2, count: 0 },
        { min: min_price + step * 2, max: min_price + step * 3, count: 0 },
        { min: min_price + step * 3, max: max_price, count: 0 }
      ].map(range => {
        // Contar produtos em cada faixa
        const countQuery = `
          SELECT COUNT(*) as count 
          FROM products 
          WHERE is_active = 1 AND price >= ? AND price <= ?
        `;
        
        const stmtCount = db.prepare(countQuery);
        const { count } = stmtCount.get(range.min, range.max);
        
        return { ...range, count };
      }).filter(range => range.count > 0);
    } catch (error) {
      console.error('Erro ao buscar faixas de preço:', error);
      return [];
    }
  }
}

// Determinar o tipo de adaptador a ser usado com base no ambiente
// Para desenvolvimento, usar SQLite local como padrão
// Para produção, podemos configurar para usar Turso
// Lendo a variável de ambiente DATABASE_TYPE, ou usando 'sqlite' como padrão
const dbType = process.env.DATABASE_TYPE || 'sqlite';

// Criar o adaptador apropriado usando a factory
const adapter = DatabaseAdapterFactory.create(dbType);

// Exportar uma instância do serviço para uso em toda a aplicação
const productService = new ProductService(adapter);
export default productService;