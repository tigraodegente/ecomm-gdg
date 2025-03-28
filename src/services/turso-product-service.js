/**
 * Serviço para acesso a dados de produtos com Turso
 */
import { getTursoClient, executeQuery } from '../db/turso-client';

class TursoProductService {
  /**
   * Lista produtos com filtros e paginação
   * @param {Object} options - Opções de filtro e paginação
   * @returns {Promise<Object>} Produtos e metadados da paginação
   */
  async listProducts(options = {}) {
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
    const result = await executeQuery(query, params);
    const products = result.rows || [];
    
    // Buscar imagens principais para cada produto
    const productImagePromises = products.map(async (product) => {
      const imageQuery = `
        SELECT image_url, alt 
        FROM product_images 
        WHERE product_id = ? AND variant_id IS NULL 
        ORDER BY is_default DESC, display_order ASC 
        LIMIT 1
      `;
      
      const imageResult = await executeQuery(imageQuery, [product.id]);
      const image = imageResult.rows?.[0];
      
      return {
        ...product,
        mainImage: image ? image.image_url : null,
        imageAlt: image ? image.alt : product.name
      };
    });
    
    // Aguardar todas as consultas de imagem
    const productsWithImages = await Promise.all(productImagePromises);
    
    // Contar total de produtos para a paginação
    let countQuery = query.replace(/SELECT.*?FROM/s, 'SELECT COUNT(*) as total FROM');
    // Remover a cláusula ORDER BY e LIMIT
    countQuery = countQuery.replace(/ORDER BY.*$/s, '');
    const countResult = await executeQuery(countQuery, params.slice(0, -2));
    const total = countResult.rows?.[0]?.total || 0;
    
    // Calcular total de páginas
    const totalPages = Math.ceil(total / limit);
    
    return {
      products: productsWithImages,
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
   * @returns {Promise<Object|null>} Produto completo ou null se não encontrado
   */
  async getProductById(productId, bySlug = false) {
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
    const result = await executeQuery(query, [productId]);
    const product = result.rows?.[0];
    
    if (!product) {
      return null;
    }
    
    // Buscar imagens do produto
    const imagesQuery = `
      SELECT * 
      FROM product_images 
      WHERE product_id = ? AND variant_id IS NULL 
      ORDER BY is_default DESC, display_order ASC
    `;
    
    const imagesResult = await executeQuery(imagesQuery, [product.id]);
    product.images = imagesResult.rows || [];
    
    // Buscar atributos do produto
    const attributesQuery = `
      SELECT 
        pav.id, pav.value, pav.display_value,
        pat.id as type_id, pat.name as type_name, pat.display_name as type_display_name
      FROM product_attribute_values pav
      JOIN product_attribute_types pat ON pav.attribute_type_id = pat.id
      WHERE pav.product_id = ? AND pav.variant_id IS NULL
    `;
    
    const attributesResult = await executeQuery(attributesQuery, [product.id]);
    product.attributes = attributesResult.rows || [];
    
    // Se o produto tiver variantes, buscá-las
    if (product.is_variable) {
      const variantsQuery = `
        SELECT * 
        FROM product_variants 
        WHERE product_id = ? AND is_active = 1
      `;
      
      const variantsResult = await executeQuery(variantsQuery, [product.id]);
      const variants = variantsResult.rows || [];
      
      // Para cada variante, buscar seus atributos e imagens
      const variantsWithDetailsPromises = variants.map(async (variant) => {
        const variantAttributesQuery = `
          SELECT 
            pav.id, pav.value, pav.display_value,
            pat.id as type_id, pat.name as type_name, pat.display_name as type_display_name
          FROM product_attribute_values pav
          JOIN product_attribute_types pat ON pav.attribute_type_id = pat.id
          WHERE pav.product_id = ? AND pav.variant_id = ?
        `;
        
        const variantImagesQuery = `
          SELECT * 
          FROM product_images 
          WHERE product_id = ? AND variant_id = ? 
          ORDER BY is_default DESC, display_order ASC
        `;
        
        // Executar consultas em paralelo
        const [attributesResult, imagesResult] = await Promise.all([
          executeQuery(variantAttributesQuery, [product.id, variant.id]),
          executeQuery(variantImagesQuery, [product.id, variant.id])
        ]);
        
        variant.attributes = attributesResult.rows || [];
        variant.images = imagesResult.rows || [];
        
        // Se a variante não tiver imagens específicas, usar as imagens do produto
        if (!variant.images || variant.images.length === 0) {
          variant.images = product.images;
        }
        
        return variant;
      });
      
      // Aguardar todas as consultas de detalhes da variante
      product.variants = await Promise.all(variantsWithDetailsPromises);
    }
    
    // Buscar produtos relacionados (da mesma categoria)
    const relatedQuery = `
      SELECT 
        p.id, p.name, p.price, p.slug, p.is_variable,
        (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY is_default DESC, display_order ASC LIMIT 1) as main_image
      FROM products p
      WHERE p.category_id = ? AND p.id != ? AND p.is_active = 1
      ORDER BY RANDOM()
      LIMIT 4
    `;
    
    const relatedResult = await executeQuery(relatedQuery, [product.category_id, product.id]);
    product.relatedProducts = relatedResult.rows || [];
    
    return product;
  }
  
  /**
   * Busca produtos por categoria
   * @param {number|string} categoryId - ID da categoria ou CID
   * @param {boolean} byCid - Se true, busca pelo CID em vez de ID
   * @param {Object} options - Opções de paginação e filtro
   * @returns {Promise<Object>} Produtos e metadados da paginação
   */
  async getProductsByCategoryId(categoryId, byCid = false, options = {}) {
    // Se buscar por CID, primeiro encontrar o ID da categoria
    if (byCid) {
      const categoryQuery = `
        SELECT c.id
        FROM categories c
        JOIN category_identifiers ci ON c.id = ci.category_id
        WHERE ci.cid = ?
      `;
      
      const categoryResult = await executeQuery(categoryQuery, [categoryId]);
      const category = categoryResult.rows?.[0];
      
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
    const subcategoriesQuery = `
      SELECT id FROM categories WHERE parent_id = ?
    `;
    
    const subcategoriesResult = await executeQuery(subcategoriesQuery, [categoryId]);
    const subcategories = subcategoriesResult.rows || [];
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
   * @returns {Promise<Array>} Lista de produtos em destaque
   */
  async getFeaturedProducts(limit = 8) {
    const result = await this.listProducts({
      featured: true,
      limit,
      sort: 'featured'
    });
    
    return result.products;
  }
  
  /**
   * Busca produtos recentemente adicionados
   * @param {number} limit - Limite de produtos a retornar
   * @returns {Promise<Array>} Lista de produtos recentes
   */
  async getNewArrivals(limit = 8) {
    const result = await this.listProducts({
      limit,
      sort: 'newest'
    });
    
    return result.products;
  }
  
  /**
   * Busca avançada de produtos
   * @param {string} term - Termo de busca
   * @param {Object} options - Opções adicionais (limite, página, filtros)
   * @returns {Promise<Object>} Resultados da busca e dados para indexação
   */
  async searchProducts(term, options = {}) {
    const {
      limit = 20,
      page = 1,
      includeAllForIndex = false
    } = options;
    
    // Se estiver buscando todos os produtos para indexação
    if (includeAllForIndex) {
      const query = `
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
        LIMIT 500
      `;
      
      const result = await executeQuery(query);
      const products = result.rows || [];
      
      // Buscar atributos para cada produto para melhorar a indexação
      const productsWithAttributesPromises = products.map(async (product) => {
        const attributesQuery = `
          SELECT pat.name as type_name, pav.value, pav.display_value
          FROM product_attribute_values pav
          JOIN product_attribute_types pat ON pav.attribute_type_id = pat.id
          WHERE pav.product_id = ? AND pav.variant_id IS NULL
        `;
        
        const attributesResult = await executeQuery(attributesQuery, [product.id]);
        const attributes = attributesResult.rows || [];
        
        // Extrair valores de atributos para texto de busca
        product.attributeValues = attributes.map(attr => 
          `${attr.type_name} ${attr.value} ${attr.display_value || ''}`
        ).join(' ');
        
        // Preparar dados para indexação por FlexSearch
        product.searchData = `${product.name} ${product.short_description || ''} ${product.description || ''} ${product.category_name || ''} ${product.vendor_name || ''} ${product.attributeValues || ''}`;
        
        return product;
      });
      
      const productsWithAttributes = await Promise.all(productsWithAttributesPromises);
      
      return { products: productsWithAttributes };
    }
    
    // Caso contrário, busca normal com o termo
    if (!term || term.trim() === '') {
      return this.listProducts({ ...options, page, limit });
    }
    
    // Busca por similaridade de texto
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
      (page - 1) * limit
    );
    
    // Executar a query
    const result = await executeQuery(query, params);
    const products = result.rows || [];
    
    // Contar total para paginação
    let countQuery = query.replace(/SELECT.*?FROM/s, 'SELECT COUNT(*) as total FROM');
    countQuery = countQuery.replace(/ORDER BY.*$/s, '');
    
    const countResult = await executeQuery(countQuery, params.slice(0, -2));
    const total = countResult.rows?.[0]?.total || 0;
    
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
const tursoProductService = new TursoProductService();
export default tursoProductService;