// Serviço para acesso a dados de produtos
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Obter o diretório atual para paths absolutos
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Criar conexão com o banco de dados SQLite
// Usando path absoluto para garantir que o banco seja encontrado
const dbPath = resolve(__dirname, '../../marketplace.db');
console.log('Conectando ao banco de dados em:', dbPath);
const db = new Database(dbPath, { readonly: true });

/**
 * Serviço de acesso a dados para produtos
 */
class ProductService {
  /**
   * Lista produtos com filtros e paginação
   * @param {Object} options - Opções de filtro e paginação
   * @returns {Object} Produtos e metadados da paginação
   */
  listProducts(options = {}) {
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
    
    // Filtro por múltiplas categorias
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
    
    // Filtros por atributos
    if (Object.keys(attributeFilters).length > 0) {
      // Para cada tipo de atributo no filtro
      Object.entries(attributeFilters).forEach(([typeId, values]) => {
        if (values && values.length > 0) {
          // Subconsulta para encontrar produtos com o atributo específico
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
    
    // Adicionar paginação
    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    // Executar a query
    const stmt = db.prepare(query);
    const products = stmt.all(...params);
    
    // Buscar imagens principais para cada produto
    const getProductMainImage = db.prepare(`
      SELECT image_url, alt 
      FROM product_images 
      WHERE product_id = ? AND variant_id IS NULL 
      ORDER BY is_default DESC, display_order ASC 
      LIMIT 1
    `);
    
    // Adicionar imagem principal a cada produto
    products.forEach(product => {
      const image = getProductMainImage.get(product.id);
      product.mainImage = image ? image.image_url : null;
      product.imageAlt = image ? image.alt : product.name;
      
      // Verificar se o produto tem variantes
      if (product.is_variable) {
        const hasVariants = db.prepare(`
          SELECT COUNT(*) as count 
          FROM product_variants 
          WHERE product_id = ?
        `).get(product.id);
        
        product.hasVariants = hasVariants.count > 0;
      }
    });
    
    // Contar total de produtos para a paginação
    let countQuery = query.replace(/SELECT.*?FROM/s, 'SELECT COUNT(*) as total FROM');
    // Remover a cláusula ORDER BY e LIMIT
    countQuery = countQuery.replace(/ORDER BY.*$/s, '');
    const countStmt = db.prepare(countQuery);
    const { total } = countStmt.get(...params.slice(0, -2)) || { total: 0 };
    
    // Calcular total de páginas
    const totalPages = Math.ceil(total / limit);
    
    return {
      products,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    };
  }
  
  /**
   * Busca um produto pelo ID, incluindo todas as relações
   * @param {number|string} productId - ID do produto ou slug
   * @param {boolean} bySlug - Se true, busca pelo slug em vez de ID
   * @returns {Object|null} Produto completo ou null se não encontrado
   */
  getProductById(productId, bySlug = false) {
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
    
    // Adicionar condição para busca por ID ou slug
    query += bySlug ? 'p.slug = ?' : 'p.id = ?';
    
    // Executar a query
    const stmt = db.prepare(query);
    const product = stmt.get(productId);
    
    if (!product) {
      return null;
    }
    
    // Buscar imagens do produto
    const getProductImages = db.prepare(`
      SELECT * 
      FROM product_images 
      WHERE product_id = ? AND variant_id IS NULL 
      ORDER BY is_default DESC, display_order ASC
    `);
    
    product.images = getProductImages.all(product.id);
    
    // Buscar atributos do produto
    const getProductAttributes = db.prepare(`
      SELECT 
        pav.id, pav.value, pav.display_value,
        pat.id as type_id, pat.name as type_name, pat.display_name as type_display_name
      FROM product_attribute_values pav
      JOIN product_attribute_types pat ON pav.attribute_type_id = pat.id
      WHERE pav.product_id = ? AND pav.variant_id IS NULL
    `);
    
    product.attributes = getProductAttributes.all(product.id);
    
    // Se o produto tiver variantes, buscá-las
    if (product.is_variable) {
      const getProductVariants = db.prepare(`
        SELECT * 
        FROM product_variants 
        WHERE product_id = ? AND is_active = 1
      `);
      
      const variants = getProductVariants.all(product.id);
      
      // Para cada variante, buscar seus atributos e imagens
      const getVariantAttributes = db.prepare(`
        SELECT 
          pav.id, pav.value, pav.display_value,
          pat.id as type_id, pat.name as type_name, pat.display_name as type_display_name
        FROM product_attribute_values pav
        JOIN product_attribute_types pat ON pav.attribute_type_id = pat.id
        WHERE pav.product_id = ? AND pav.variant_id = ?
      `);
      
      const getVariantImages = db.prepare(`
        SELECT * 
        FROM product_images 
        WHERE product_id = ? AND variant_id = ? 
        ORDER BY is_default DESC, display_order ASC
      `);
      
      variants.forEach(variant => {
        variant.attributes = getVariantAttributes.all(product.id, variant.id);
        variant.images = getVariantImages.all(product.id, variant.id);
        
        // Se a variante não tiver imagens específicas, usar as imagens do produto
        if (!variant.images || variant.images.length === 0) {
          variant.images = product.images;
        }
      });
      
      product.variants = variants;
    }
    
    // Buscar produtos relacionados (da mesma categoria)
    const getRelatedProducts = db.prepare(`
      SELECT 
        p.id, p.name, p.price, p.slug, p.is_variable,
        (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY is_default DESC, display_order ASC LIMIT 1) as main_image
      FROM products p
      WHERE p.category_id = ? AND p.id != ? AND p.is_active = 1
      ORDER BY RANDOM()
      LIMIT 4
    `);
    
    product.relatedProducts = getRelatedProducts.all(product.category_id, product.id);
    
    return product;
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
   * Busca produtos em destaque
   * @param {number} limit - Limite de produtos a retornar
   * @returns {Array} Lista de produtos em destaque
   */
  getFeaturedProducts(limit = 8) {
    return this.listProducts({
      featured: true,
      limit,
      sort: 'featured'
    }).products;
  }
  
  /**
   * Busca produtos recentemente adicionados
   * @param {number} limit - Limite de produtos a retornar
   * @returns {Array} Lista de produtos recentes
   */
  getNewArrivals(limit = 8) {
    return this.listProducts({
      limit,
      sort: 'newest'
    }).products;
  }
  
  /**
   * Busca variantes de um produto
   * @param {number} productId - ID do produto
   * @returns {Array} Lista de variantes
   */
  getProductVariants(productId) {
    const getVariants = db.prepare(`
      SELECT * 
      FROM product_variants 
      WHERE product_id = ? AND is_active = 1
    `);
    
    const variants = getVariants.all(productId);
    
    // Para cada variante, buscar seus atributos
    const getVariantAttributes = db.prepare(`
      SELECT 
        pav.id, pav.value, pav.display_value,
        pat.id as type_id, pat.name as type_name, pat.display_name as type_display_name
      FROM product_attribute_values pav
      JOIN product_attribute_types pat ON pav.attribute_type_id = pat.id
      WHERE pav.product_id = ? AND pav.variant_id = ?
    `);
    
    variants.forEach(variant => {
      variant.attributes = getVariantAttributes.all(productId, variant.id);
    });
    
    return variants;
  }
  
  /**
   * Busca produtos relacionados a um produto específico
   * @param {number} productId - ID do produto
   * @param {number} limit - Limite de produtos a retornar
   * @returns {Array} Lista de produtos relacionados
   */
  getRelatedProducts(productId, limit = 4) {
    // Primeiro buscar a categoria do produto
    const getProductCategory = db.prepare(`
      SELECT category_id FROM products WHERE id = ?
    `);
    
    const product = getProductCategory.get(productId);
    if (!product) {
      return [];
    }
    
    // Buscar produtos da mesma categoria
    const getRelatedProducts = db.prepare(`
      SELECT 
        p.id, p.name, p.price, p.slug, p.is_variable, p.short_description,
        (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY is_default DESC, display_order ASC LIMIT 1) as main_image
      FROM products p
      WHERE p.category_id = ? AND p.id != ? AND p.is_active = 1
      ORDER BY RANDOM()
      LIMIT ?
    `);
    
    return getRelatedProducts.all(product.category_id, productId, limit);
  }
  
  /**
   * Obtém os tipos de atributos disponíveis para filtros
   * @returns {Array} Lista de tipos de atributos
   */
  getAttributeTypesForFilters() {
    const stmt = db.prepare(`
      SELECT 
        pat.id, pat.name, pat.display_name,
        COUNT(DISTINCT pav.id) as usage_count
      FROM product_attribute_types pat
      JOIN product_attribute_values pav ON pat.id = pav.attribute_type_id
      JOIN products p ON pav.product_id = p.id
      WHERE pat.is_visible_in_filters = 1 
        AND pat.is_active = 1
        AND p.is_active = 1
      GROUP BY pat.id
      HAVING usage_count > 0
      ORDER BY pat.display_order ASC, pat.display_name ASC
    `);
    
    return stmt.all();
  }
  
  /**
   * Obtém os valores únicos para um tipo de atributo
   * @param {number} attributeTypeId - ID do tipo de atributo
   * @param {Object} options - Opções de filtro
   * @returns {Array} Lista de valores de atributo
   */
  getAttributeValuesForType(attributeTypeId, options = {}) {
    const { categoryId, search } = options;
    
    let query = `
      SELECT 
        pav.value, pav.display_value,
        COUNT(DISTINCT p.id) as product_count
      FROM product_attribute_values pav
      JOIN products p ON pav.product_id = p.id
      WHERE pav.attribute_type_id = ? 
        AND p.is_active = 1
    `;
    
    const params = [attributeTypeId];
    
    // Filtrar por categoria se necessário
    if (categoryId) {
      query += ` AND p.category_id = ?`;
      params.push(categoryId);
    }
    
    // Filtrar por termo de busca se necessário
    if (search && search.trim() !== '') {
      query += ` AND (p.name LIKE ? OR p.description LIKE ? OR p.short_description LIKE ?)`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }
    
    query += `
      GROUP BY pav.value
      HAVING product_count > 0
      ORDER BY product_count DESC, pav.display_value ASC
    `;
    
    const stmt = db.prepare(query);
    return stmt.all(...params);
  }
  
  /**
   * Obtém as faixas de preço para os produtos disponíveis
   * @param {Object} options - Opções de filtro
   * @returns {Object} Objeto com preço mínimo, máximo e contagens
   */
  getPriceRangesForProducts(options = {}) {
    const { categoryId, search } = options;
    
    let query = `
      SELECT 
        MIN(p.price) as min_price,
        MAX(p.price) as max_price,
        AVG(p.price) as avg_price
      FROM products p
      WHERE p.is_active = 1
    `;
    
    const params = [];
    
    // Filtrar por categoria se necessário
    if (categoryId) {
      query += ` AND p.category_id = ?`;
      params.push(categoryId);
    }
    
    // Filtrar por termo de busca se necessário
    if (search && search.trim() !== '') {
      query += ` AND (p.name LIKE ? OR p.description LIKE ? OR p.short_description LIKE ?)`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }
    
    const stmt = db.prepare(query);
    const priceStats = stmt.get(...params);
    
    // Definir faixas de preço com base nos dados
    const min = Math.floor(priceStats.min_price || 0);
    const max = Math.ceil(priceStats.max_price || 1000);
    const avg = Math.round(priceStats.avg_price || 500);
    
    // Definir faixas de preço personalizadas
    const ranges = [];
    
    if (max <= 100) {
      // Faixas para produtos de baixo valor
      ranges.push({ min: 0, max: Math.round(max * 0.25), label: `Até R$ ${Math.round(max * 0.25)}` });
      ranges.push({ min: Math.round(max * 0.25), max: Math.round(max * 0.5), label: `R$ ${Math.round(max * 0.25)} - R$ ${Math.round(max * 0.5)}` });
      ranges.push({ min: Math.round(max * 0.5), max: Math.round(max * 0.75), label: `R$ ${Math.round(max * 0.5)} - R$ ${Math.round(max * 0.75)}` });
      ranges.push({ min: Math.round(max * 0.75), max: max, label: `R$ ${Math.round(max * 0.75)} - R$ ${max}` });
    } else {
      // Faixas padrão para produtos de valor médio/alto
      ranges.push({ min: 0, max: 50, label: `Até R$ 50` });
      if (max > 100) ranges.push({ min: 50, max: 100, label: `R$ 50 - R$ 100` });
      if (max > 200) ranges.push({ min: 100, max: 200, label: `R$ 100 - R$ 200` });
      if (max > 500) ranges.push({ min: 200, max: 500, label: `R$ 200 - R$ 500` });
      if (max > 1000) ranges.push({ min: 500, max: 1000, label: `R$ 500 - R$ 1.000` });
      if (max > 2000) ranges.push({ min: 1000, max: 2000, label: `R$ 1.000 - R$ 2.000` });
      if (max > 5000) ranges.push({ min: 2000, max: 5000, label: `R$ 2.000 - R$ 5.000` });
      if (max > 10000) ranges.push({ min: 5000, max: 10000, label: `R$ 5.000 - R$ 10.000` });
      if (max > 10000) ranges.push({ min: 10000, max: null, label: `Acima de R$ 10.000` });
      else if (max > 5000) ranges.push({ min: 5000, max: null, label: `Acima de R$ 5.000` });
      else if (max > 2000) ranges.push({ min: 2000, max: null, label: `Acima de R$ 2.000` });
      else if (max > 1000) ranges.push({ min: 1000, max: null, label: `Acima de R$ 1.000` });
      else if (max > 500) ranges.push({ min: 500, max: null, label: `Acima de R$ 500` });
      else ranges.push({ min: 200, max: null, label: `Acima de R$ 200` });
    }
    
    return {
      min,
      max,
      avg,
      ranges
    };
  }
  
  /**
   * Conta produtos por categoria para filtros
   * @param {Object} options - Opções de filtro
   * @returns {Array} Lista de categorias com contagens
   */
  getCategoriesWithProductCount(options = {}) {
    const { search, minPrice, maxPrice, attributeFilters = {} } = options;
    
    let query = `
      SELECT 
        c.id, c.name, c.parent_id, ci.cid,
        COUNT(DISTINCT p.id) as product_count
      FROM categories c
      LEFT JOIN category_identifiers ci ON c.id = ci.category_id
      JOIN products p ON c.id = p.category_id
      WHERE c.is_active = 1 AND p.is_active = 1
    `;
    
    const params = [];
    
    // Filtro por termo de busca
    if (search && search.trim() !== '') {
      query += ` AND (p.name LIKE ? OR p.description LIKE ? OR p.short_description LIKE ?)`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
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
    
    // Filtros por atributos
    if (Object.keys(attributeFilters).length > 0) {
      // Para cada tipo de atributo no filtro
      Object.entries(attributeFilters).forEach(([typeId, values]) => {
        if (values && values.length > 0) {
          // Subconsulta para encontrar produtos com o atributo específico
          query += ` AND p.id IN (
            SELECT pav.product_id 
            FROM product_attribute_values pav 
            WHERE pav.attribute_type_id = ? AND pav.value IN (${values.map(() => '?').join(',')})
          )`;
          params.push(typeId, ...values);
        }
      });
    }
    
    query += `
      GROUP BY c.id
      HAVING product_count > 0
      ORDER BY c.display_order ASC, c.name ASC
    `;
    
    const stmt = db.prepare(query);
    return stmt.all(...params);
  }
  
  /**
   * Obtém os materiais disponíveis como filtro
   * @param {Object} options - Opções de filtro
   * @returns {Array} Lista de materiais com contagens
   */
  getMaterialsForFilter(options = {}) {
    const { categoryId, search, minPrice, maxPrice } = options;
    
    // Buscar tipo de atributo 'material'
    const getAttributeType = db.prepare(`
      SELECT id FROM product_attribute_types 
      WHERE name = 'material' OR name = 'Material' OR name LIKE '%material%'
      LIMIT 1
    `);
    
    const materialType = getAttributeType.get();
    if (!materialType) return [];
    
    // Buscar valores para o tipo material
    return this.getAttributeValuesForType(materialType.id, { categoryId, search });
  }
  
  /**
   * Obtém as cores disponíveis como filtro
   * @param {Object} options - Opções de filtro
   * @returns {Array} Lista de cores com contagens
   */
  getColorsForFilter(options = {}) {
    const { categoryId, search, minPrice, maxPrice } = options;
    
    // Buscar tipo de atributo 'cor'
    const getAttributeType = db.prepare(`
      SELECT id FROM product_attribute_types 
      WHERE name = 'cor' OR name = 'color' OR name LIKE '%cor%' OR name LIKE '%color%'
      LIMIT 1
    `);
    
    const colorType = getAttributeType.get();
    if (!colorType) return [];
    
    // Buscar valores para o tipo cor
    return this.getAttributeValuesForType(colorType.id, { categoryId, search });
  }
  
  /**
   * Obtém os tamanhos disponíveis como filtro
   * @param {Object} options - Opções de filtro
   * @returns {Array} Lista de tamanhos com contagens
   */
  getSizesForFilter(options = {}) {
    const { categoryId, search, minPrice, maxPrice } = options;
    
    // Buscar tipo de atributo 'tamanho'
    const getAttributeType = db.prepare(`
      SELECT id FROM product_attribute_types 
      WHERE name = 'tamanho' OR name = 'size' OR name LIKE '%tamanho%' OR name LIKE '%size%'
      LIMIT 1
    `);
    
    const sizeType = getAttributeType.get();
    if (!sizeType) return [];
    
    // Buscar valores para o tipo tamanho
    return this.getAttributeValuesForType(sizeType.id, { categoryId, search });
  }
  
  /**
   * Busca avançada de produtos usando FlexSearch
   * @param {string} term - Termo de busca
   * @param {Object} options - Opções adicionais (limite, página, filtros)
   * @returns {Object} Resultados da busca e dados para indexação
   */
  searchProducts(term, options = {}) {
    const {
      limit = 20,
      page = 1,
      includeAllForIndex = false
    } = options;
    
    // Se estiver buscando todos os produtos para indexação
    if (includeAllForIndex) {
      console.log('Buscando todos os produtos para indexação do banco de dados...');
      const getAllProducts = db.prepare(`
        SELECT 
          p.id, p.name, p.short_description, p.description, p.price, 
          p.compare_at_price, p.is_variable, p.slug, p.sku,
          c.name as category_name, ci.cid as category_cid,
          v.shop_name as vendor_name,
          (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY is_default DESC, display_order ASC LIMIT 1) as main_image
        FROM products p
        JOIN categories c ON p.category_id = c.id
        LEFT JOIN category_identifiers ci ON c.id = ci.category_id
        LEFT JOIN vendors v ON p.vendor_id = v.id
        WHERE p.is_active = 1
        ORDER BY p.id DESC
        LIMIT 1000
      `);
      
      const products = getAllProducts.all();
      
      // Buscar atributos para cada produto para melhorar a indexação
      const getProductAttributes = db.prepare(`
        SELECT pat.name as type_name, pav.value, pav.display_value
        FROM product_attribute_values pav
        JOIN product_attribute_types pat ON pav.attribute_type_id = pat.id
        WHERE pav.product_id = ? AND pav.variant_id IS NULL
      `);
      
      // Adicionar atributos e categorias aninhadas a cada produto
      products.forEach(product => {
        const attributes = getProductAttributes.all(product.id);
        
        // Extrair valores de atributos para texto de busca
        product.attributeValues = attributes.map(attr => 
          `${attr.type_name} ${attr.value} ${attr.display_value || ''}`
        ).join(' ');
        
        // Preparar dados para indexação por FlexSearch
        product.searchData = `${product.name} ${product.short_description || ''} ${product.description || ''} ${product.category_name || ''} ${product.vendor_name || ''} ${product.attributeValues || ''}`;
      });
      
      console.log(`Encontrados ${products.length} produtos no banco de dados`);
      
      // Debug de produtos com "kit" no nome
      const kitsProducts = products.filter(p => p.name && p.name.toLowerCase().includes('kit'));
      if (kitsProducts.length > 0) {
        console.log(`Produtos com "kit" encontrados no banco: ${kitsProducts.length}`);
        kitsProducts.slice(0, 3).forEach(p => {
          console.log(`- ${p.name}`);
        });
      }
      
      return { products };
    }
    
    // Caso contrário, busca normal com o termo
    if (!term || term.trim() === '') {
      return this.listProducts({ ...options, page, limit });
    }
    
    // Cálculo do offset para paginação
    const offset = (page - 1) * limit;
    
    // Busca por similaridade de texto - versão básica usando LIKE
    // Em um banco mais avançado, usaríamos FTS (Full Text Search)
    let query = `
      SELECT 
        p.id, p.name, p.short_description, p.price, p.compare_at_price,
        p.is_variable, p.slug, p.stock, p.sku, p.is_featured,
        c.id as category_id, c.name as category_name,
        ci.cid as category_cid,
        (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY is_default DESC, display_order ASC LIMIT 1) as main_image
      FROM products p
      JOIN categories c ON p.category_id = c.id
      LEFT JOIN category_identifiers ci ON c.id = ci.category_id
      WHERE p.is_active = 1 AND (
        p.name LIKE ? OR 
        p.description LIKE ? OR 
        p.short_description LIKE ? OR
        p.sku LIKE ? OR
        c.name LIKE ?
      )
    `;
    
    // Parâmetros da busca
    const searchPattern = `%${term}%`;
    const params = [
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern
    ];
    
    // Também buscar por atributos do produto
    query += `
      OR p.id IN (
        SELECT pav.product_id 
        FROM product_attribute_values pav
        JOIN product_attribute_types pat ON pav.attribute_type_id = pat.id
        WHERE pav.value LIKE ? 
          OR pav.display_value LIKE ?
          OR pat.name LIKE ?
      )
    `;
    
    params.push(searchPattern, searchPattern, searchPattern);
    
    // Ordenação: primeiro os que têm o termo no nome (mais relevantes)
    query += `
      ORDER BY 
        CASE WHEN p.name LIKE ? THEN 1
             WHEN p.short_description LIKE ? THEN 2
             WHEN c.name LIKE ? THEN 3
             ELSE 4
        END,
        p.is_featured DESC,
        p.id DESC
      LIMIT ? OFFSET ?
    `;
    
    params.push(
      `%${term}%`,
      `%${term}%`,
      `%${term}%`,
      limit,
      offset
    );
    
    // Executar a query
    const stmt = db.prepare(query);
    const products = stmt.all(...params);
    
    // Contar total de produtos para a paginação
    let countQuery = query.replace(/SELECT.*?FROM/s, 'SELECT COUNT(*) as total FROM');
    // Remover a cláusula ORDER BY e LIMIT
    countQuery = countQuery.replace(/ORDER BY.*$/s, '');
    const countStmt = db.prepare(countQuery);
    const { total } = countStmt.get(...params.slice(0, -2)) || { total: 0 };
    
    // Calcular total de páginas
    const totalPages = Math.ceil(total / limit);
    
    return {
      products,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    };
  }
}

// Exportar uma instância do serviço para uso em toda a aplicação
const productService = new ProductService();
export default productService;