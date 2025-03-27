import productService from '../services/productService';
import type { APIContext } from 'astro';

// Log para depuração
console.log('Carregando módulo de actions de busca');

/**
 * Action para busca de produtos e geração de índice de busca
 */
export const search = {
  /**
   * Fornece produtos para indexação pelo FlexSearch com dados enriquecidos
   * @returns {Promise<Object>} Produtos formatados para indexação
   */
  async getSearchIndex() {
    try {
      // Buscar produtos com formatação para indexação
      const { products } = productService.searchProducts('', { includeAllForIndex: true });
      
      // Formatar resposta para ser consumida pelo FlexSearch com dados enriquecidos
      const formattedProducts = products.map(product => {
        // Extrair atributos do produto para enriquecer a busca
        const attributes = product.attributeValues || '';
        
        // Criar texto otimizado para busca com termos relacionados
        const searchableText = [
          product.name,
          product.short_description || '',
          product.description || '',
          product.category_name || '',
          product.vendor_name || '',
          attributes,
          product.sku || ''
        ].filter(Boolean).join(' ');
        
        return {
          id: product.id,
          name: product.name,
          description: product.short_description || '',
          price: product.price,
          comparePrice: product.compare_at_price,
          image: product.mainImage || product.main_image || 'https://gdg-images.s3.sa-east-1.amazonaws.com/gcp/logo-vertical-white.webp',
          slug: product.slug || product.id,
          vendorName: product.vendor_name || '',
          category: product.category_name,
          searchData: searchableText,
          // Campos adicionais para melhorar a experiência de busca
          tags: product.tags || [],
          rating: product.rating || null,
          brand: product.brand || product.vendor_name || '',
          sku: product.sku || '',
          hasDiscount: product.compare_at_price > product.price
        };
      });
      
      return {
        success: true,
        products: formattedProducts,
        timestamp: Date.now() // Adiciona timestamp para controle de cache
      };
    } catch (error) {
      console.error('Erro ao gerar índice de busca:', error);
      return {
        success: false,
        error: 'Falha ao gerar índice de busca'
      };
    }
  },
  
  /**
   * Busca produtos por termo com suporte a filtros e paginação avançada
   * @param {Object} params Parâmetros de busca
   * @returns {Promise<Object>} Resultados da busca
   */
  async searchProducts({ term, page = 1, limit = 20, filters = {} } = {}) {
    try {
      if (!term) {
        return {
          success: true,
          products: [],
          pagination: {
            total: 0,
            page: 1,
            limit,
            totalPages: 0,
            hasNextPage: false,
            hasPrevPage: false
          }
        };
      }
      
      // Extrair os filtros
      const { category, minPrice, maxPrice, sort } = filters;
      
      // Preparar opções para o serviço de produtos
      const searchOptions = {
        page,
        limit,
        sort: sort || 'relevance',  // Ordenação padrão por relevância para busca
      };
      
      // Adicionar filtros de categoria se fornecidos
      if (category) {
        searchOptions.categoryName = category;
      }
      
      // Adicionar filtros de preço se fornecidos
      if (minPrice !== undefined) {
        searchOptions.minPrice = minPrice;
      }
      
      if (maxPrice !== undefined) {
        searchOptions.maxPrice = maxPrice;
      }
      
      // Busca produtos com o termo e filtros
      const { products, pagination } = productService.searchProducts(term, searchOptions);
      
      // Formatar produtos para resposta com dados enriquecidos
      const formattedProducts = products.map(product => ({
        id: product.id,
        name: product.name,
        description: product.short_description || '',
        price: product.price,
        comparePrice: product.compare_at_price,
        image: product.mainImage || product.main_image || 'https://gdg-images.s3.sa-east-1.amazonaws.com/gcp/logo-vertical-white.webp',
        slug: product.slug || product.id,
        category: product.category_name,
        vendorName: product.vendor_name || '',
        brand: product.brand || product.vendor_name || '',
        rating: product.rating || null,
        hasDiscount: product.compare_at_price > product.price,
        discountPercent: product.compare_at_price > product.price ? 
          Math.round(((product.compare_at_price - product.price) / product.compare_at_price) * 100) : 0,
        // Adicionar texto destacável para highlightText
        searchableText: product.name + ' ' + (product.short_description || '')
      }));
      
      // Retornar filtros disponíveis para os resultados encontrados
      const availableFilters = {};
      
      if (products.length > 0) {
        // Extrair categorias únicas dos resultados
        const categoriesSet = new Set();
        products.forEach(p => {
          if (p.category_name) categoriesSet.add(p.category_name);
        });
        availableFilters.categories = Array.from(categoriesSet).sort();
        
        // Extrair faixa de preços dos resultados
        const prices = products.map(p => p.price).filter(Boolean);
        if (prices.length > 0) {
          availableFilters.priceRange = {
            min: Math.min(...prices),
            max: Math.max(...prices)
          };
        }
      }
      
      // Retornar resultados com filtros disponíveis
      return {
        success: true,
        products: formattedProducts,
        pagination,
        filters: availableFilters,
        appliedFilters: {
          term,
          ...filters
        }
      };
    } catch (error) {
      console.error('Erro na busca:', error);
      return {
        success: false,
        error: 'Falha ao realizar busca',
        products: [],
        pagination: {
          total: 0,
          page: 1,
          limit,
          totalPages: 0,
          hasNextPage: false,
          hasPrevPage: false
        }
      };
    }
  }
};