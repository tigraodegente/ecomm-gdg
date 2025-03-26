const Database = require('better-sqlite3');

// Criar conexão com o banco de dados SQLite
const db = new Database("./marketplace.db");

/**
 * Script para popular o banco de dados com produtos de exemplo
 */
async function seedProductsData() {
  try {
    console.log("Iniciando seed de produtos...");
    
    // Verificar se já existem as tabelas necessárias
    const tablesExist = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name IN ('products', 'product_images', 'product_variants', 'product_attribute_types', 'product_attribute_values')
    `).all();
    
    if (tablesExist.length < 5) {
      console.log("Criando tabelas necessárias para produtos...");
      
      // Criar tabela de produtos
      db.exec(`
        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          vendor_id INTEGER NOT NULL,
          category_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          description TEXT NOT NULL,
          short_description TEXT,
          sku TEXT,
          price REAL NOT NULL,
          compare_at_price REAL,
          is_variable INTEGER DEFAULT 0,
          has_special_shipping INTEGER DEFAULT 0,
          weight REAL,
          width REAL,
          height REAL,
          length REAL,
          is_active INTEGER DEFAULT 1,
          is_featured INTEGER DEFAULT 0,
          slug TEXT NOT NULL,
          stock INTEGER DEFAULT 0,
          low_stock_threshold INTEGER DEFAULT 5,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (category_id) REFERENCES categories(id)
        )
      `);
      
      // Criar tabela de tipos de atributos
      db.exec(`
        CREATE TABLE IF NOT EXISTS product_attribute_types (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          display_name TEXT NOT NULL,
          description TEXT,
          is_visible_in_filters INTEGER DEFAULT 1,
          display_order INTEGER DEFAULT 0,
          is_active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Criar tabela de variantes
      db.exec(`
        CREATE TABLE IF NOT EXISTS product_variants (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER NOT NULL,
          sku TEXT,
          price REAL NOT NULL,
          compare_at_price REAL,
          stock INTEGER DEFAULT 0,
          weight REAL,
          width REAL,
          height REAL,
          length REAL,
          is_active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (product_id) REFERENCES products(id)
        )
      `);
      
      // Criar tabela de valores de atributos
      db.exec(`
        CREATE TABLE IF NOT EXISTS product_attribute_values (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          attribute_type_id INTEGER NOT NULL,
          product_id INTEGER NOT NULL,
          variant_id INTEGER,
          value TEXT NOT NULL,
          display_value TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (attribute_type_id) REFERENCES product_attribute_types(id),
          FOREIGN KEY (product_id) REFERENCES products(id),
          FOREIGN KEY (variant_id) REFERENCES product_variants(id)
        )
      `);
      
      // Criar tabela de imagens
      db.exec(`
        CREATE TABLE IF NOT EXISTS product_images (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER NOT NULL,
          variant_id INTEGER,
          image_url TEXT NOT NULL,
          alt TEXT,
          is_default INTEGER DEFAULT 0,
          display_order INTEGER DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (product_id) REFERENCES products(id),
          FOREIGN KEY (variant_id) REFERENCES product_variants(id)
        )
      `);
    }

    // Limpar dados existentes
    db.exec('DELETE FROM product_images');
    db.exec('DELETE FROM product_attribute_values');
    db.exec('DELETE FROM product_variants');
    db.exec('DELETE FROM products');
    db.exec('DELETE FROM product_attribute_types');
    
    // Resetar contadores de autoincremento
    db.exec('DELETE FROM sqlite_sequence WHERE name = \'products\'');
    db.exec('DELETE FROM sqlite_sequence WHERE name = \'product_variants\'');
    db.exec('DELETE FROM sqlite_sequence WHERE name = \'product_attribute_types\'');
    db.exec('DELETE FROM sqlite_sequence WHERE name = \'product_attribute_values\'');
    db.exec('DELETE FROM sqlite_sequence WHERE name = \'product_images\'');
    
    console.log("Tabelas limpas, inserindo dados de produtos...");

    // Criar vendedor fictício para os produtos
    let vendorId = 1;
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS vendors (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          shop_name TEXT NOT NULL,
          description TEXT,
          logo_url TEXT,
          banner_url TEXT,
          email TEXT NOT NULL,
          phone TEXT,
          website_url TEXT,
          commission_rate REAL DEFAULT 0,
          is_approved INTEGER DEFAULT 0,
          is_active INTEGER DEFAULT 1,
          approved_at TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Verificar se já existe um vendedor
      const vendorExists = db.prepare('SELECT id FROM vendors LIMIT 1').get();
      
      if (!vendorExists) {
        // Criar usuário fictício para o vendedor
        db.exec(`
          CREATE TABLE IF NOT EXISTS User (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            name TEXT,
            emailVerified INTEGER DEFAULT 0,
            image TEXT,
            createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
            updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        const userExists = db.prepare('SELECT id FROM User LIMIT 1').get();
        let userId = 'user_123456';
        
        if (!userExists) {
          const insertUser = db.prepare(`
            INSERT INTO User (id, email, name, emailVerified)
            VALUES (?, ?, ?, 1)
          `);
          
          insertUser.run('user_123456', 'loja@graodegente.com.br', 'Loja Grão de Gente');
        } else {
          userId = userExists.id;
        }
        
        // Inserir vendedor
        const insertVendor = db.prepare(`
          INSERT INTO vendors (user_id, shop_name, description, email, is_approved, is_active)
          VALUES (?, ?, ?, ?, 1, 1)
        `);
        
        const result = insertVendor.run(
          userId,
          'Loja Grão de Gente',
          'Loja oficial Grão de Gente com produtos para bebês e crianças',
          'loja@graodegente.com.br'
        );
        
        vendorId = result.lastInsertRowid;
        console.log(`Vendedor criado com ID: ${vendorId}`);
      } else {
        vendorId = vendorExists.id;
        console.log(`Usando vendedor existente com ID: ${vendorId}`);
      }
    } catch (error) {
      console.error('Erro ao criar vendedor:', error);
    }
    
    // Inserir tipos de atributos
    const attributeTypes = [
      { name: 'color', displayName: 'Cor', description: 'Cor do produto' },
      { name: 'size', displayName: 'Tamanho', description: 'Tamanho do produto' },
      { name: 'material', displayName: 'Material', description: 'Material principal do produto' },
      { name: 'age_group', displayName: 'Faixa Etária', description: 'Faixa etária recomendada' }
    ];
    
    const insertAttributeType = db.prepare(`
      INSERT INTO product_attribute_types (name, display_name, description, is_visible_in_filters, display_order)
      VALUES (?, ?, ?, 1, ?)
    `);
    
    attributeTypes.forEach((attr, index) => {
      insertAttributeType.run(attr.name, attr.displayName, attr.description, index);
    });
    
    // Buscar IDs dos tipos de atributos inseridos
    const getAttributeTypeId = db.prepare('SELECT id FROM product_attribute_types WHERE name = ?');
    const colorTypeId = getAttributeTypeId.get('color').id;
    const sizeTypeId = getAttributeTypeId.get('size').id;
    const materialTypeId = getAttributeTypeId.get('material').id;
    const ageGroupTypeId = getAttributeTypeId.get('age_group').id;
    
    // Buscar categorias existentes para associar produtos
    const getCategories = db.prepare(`
      SELECT id, name, parent_id FROM categories WHERE is_active = 1
    `).all();
    
    // Função para encontrar categoria por nome
    const findCategoryId = (name) => {
      const category = getCategories.find(c => c.name.toLowerCase() === name.toLowerCase());
      return category ? category.id : null;
    };
    
    // Função para gerar slug a partir do nome
    const generateSlug = (name) => {
      return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-');
    };
    
    // Inserir produtos
    const products = [
      {
        name: 'Berço Montessoriano Basic',
        categoryName: 'Berços',
        shortDescription: 'Berço montessoriano com design moderno e seguro',
        description: `
          <h2>Berço Montessoriano Basic</h2>
          <p>O Berço Montessoriano Basic é perfeito para o quarto do seu bebê. Feito com madeira de alta qualidade, possui design moderno e seguro, seguindo a filosofia montessoriana que incentiva a autonomia da criança.</p>
          <h3>Características:</h3>
          <ul>
            <li>Madeira de reflorestamento</li>
            <li>Altura adequada para bebês</li>
            <li>Acabamento não tóxico</li>
            <li>Fácil montagem</li>
            <li>Certificado pelo INMETRO</li>
          </ul>
          <h3>Dimensões:</h3>
          <p>Largura: 70cm<br>Comprimento: 130cm<br>Altura: 40cm</p>
        `,
        price: 899.90,
        compareAtPrice: 999.90,
        sku: 'BERCO-MONT-001',
        stock: 15,
        isVariable: false,
        weight: 15.5,
        width: 70,
        height: 40,
        length: 130,
        isFeatured: true,
        attributes: [
          { typeId: materialTypeId, value: 'Madeira' },
          { typeId: ageGroupTypeId, value: '0 a 2 anos' }
        ],
        images: [
          { url: 'https://picsum.photos/400?random=1001', alt: 'Berço Montessoriano Basic', isDefault: true },
          { url: 'https://picsum.photos/400?random=1002', alt: 'Detalhe do Berço Montessoriano Basic' }
        ]
      },
      {
        name: 'Kit Berço Nuvem Azul',
        categoryName: 'Lençóis',
        shortDescription: 'Kit completo para berço com 7 peças no tema nuvem',
        description: `
          <h2>Kit Berço Nuvem Azul - 7 peças</h2>
          <p>Kit Berço completo no tema nuvem, na cor azul, com acabamento premium para o conforto e segurança do seu bebê.</p>
          <h3>O kit contém:</h3>
          <ul>
            <li>1 Protetor de berço</li>
            <li>1 Edredom</li>
            <li>1 Lençol de cima com elástico</li>
            <li>1 Lençol de baixo</li>
            <li>1 Fronha</li>
            <li>1 Almofada decorativa</li>
            <li>1 Saia de berço</li>
          </ul>
          <h3>Especificações:</h3>
          <p>Material: 100% Algodão<br>Enchimento: 100% Poliéster<br>Lavável à Máquina<br>Certificado pelo INMETRO</p>
        `,
        price: 279.90,
        compareAtPrice: 329.90,
        sku: 'KIT-BERCO-AZ-001',
        stock: 20,
        isVariable: true,
        weight: 1.5,
        isFeatured: true,
        attributes: [
          { typeId: colorTypeId, value: 'Azul' },
          { typeId: materialTypeId, value: 'Algodão' },
          { typeId: ageGroupTypeId, value: '0 a 24 meses' }
        ],
        variants: [
          { sku: 'KIT-BERCO-AZ-P', price: 279.90, stock: 7, attributes: [{ typeId: sizeTypeId, value: 'Padrão' }] },
          { sku: 'KIT-BERCO-AZ-G', price: 299.90, stock: 5, attributes: [{ typeId: sizeTypeId, value: 'Grande' }] },
          { sku: 'KIT-BERCO-AZ-A', price: 349.90, stock: 8, attributes: [{ typeId: sizeTypeId, value: 'Americano' }] }
        ],
        images: [
          { url: 'https://picsum.photos/400?random=1003', alt: 'Kit Berço Nuvem Azul', isDefault: true },
          { url: 'https://picsum.photos/400?random=1004', alt: 'Kit Berço Nuvem Azul montado no berço' },
          { url: 'https://picsum.photos/400?random=1005', alt: 'Detalhe da fronha do Kit Berço Nuvem Azul' }
        ]
      },
      {
        name: 'Móbile Musical Estrelas',
        categoryName: 'Acessórios para berço',
        shortDescription: 'Móbile musical com estrelas e luzes relaxantes',
        description: `
          <h2>Móbile Musical Estrelas</h2>
          <p>O Móbile Musical Estrelas é perfeito para entreter e acalmar o bebê. Com luzes suaves e músicas relaxantes, ajuda no desenvolvimento sensorial.</p>
          <h3>Características:</h3>
          <ul>
            <li>10 melodias clássicas</li>
            <li>Luzes LED suaves com controle de intensidade</li>
            <li>Estrelas giratórias coloridas</li>
            <li>Timer de desligamento automático</li>
            <li>Controle de volume</li>
            <li>Funciona com 3 pilhas AA (não inclusas)</li>
          </ul>
          <h3>Benefícios:</h3>
          <p>Estimula a visão<br>Acalma o bebê<br>Aprimora a percepção auditiva<br>Auxilia no desenvolvimento cognitivo</p>
        `,
        price: 149.90,
        compareAtPrice: 189.90,
        sku: 'MOBILE-EST-001',
        stock: 35,
        isVariable: false,
        weight: 0.5,
        isFeatured: true,
        attributes: [
          { typeId: colorTypeId, value: 'Multicor' },
          { typeId: ageGroupTypeId, value: '0 a 12 meses' }
        ],
        images: [
          { url: 'https://picsum.photos/400?random=1006', alt: 'Móbile Musical Estrelas', isDefault: true },
          { url: 'https://picsum.photos/400?random=1007', alt: 'Móbile Musical Estrelas em funcionamento' }
        ]
      },
      {
        name: 'Tapete de Atividades Floresta',
        categoryName: 'Brinquedos para Bebês',
        shortDescription: 'Tapete de atividades com temática de floresta e diversos estímulos',
        description: `
          <h2>Tapete de Atividades Floresta</h2>
          <p>O Tapete de Atividades Floresta é um espaço divertido e educativo para o bebê brincar com segurança. Com várias texturas, sons e atividades, proporciona estímulos importantes para o desenvolvimento.</p>
          <h3>Características:</h3>
          <ul>
            <li>5 brinquedos removíveis</li>
            <li>Espelho seguro</li>
            <li>Diferentes texturas e materiais</li>
            <li>Arco com brinquedos pendentes</li>
            <li>Almofada de apoio</li>
            <li>Material lavável</li>
          </ul>
          <h3>Dimensões:</h3>
          <p>Diâmetro: 90cm<br>Altura do arco: 50cm</p>
        `,
        price: 199.90,
        compareAtPrice: 249.90,
        sku: 'TAPETE-FLOR-001',
        stock: 12,
        isVariable: false,
        weight: 1.2,
        isFeatured: true,
        attributes: [
          { typeId: materialTypeId, value: 'Poliéster' },
          { typeId: ageGroupTypeId, value: '0 a 12 meses' }
        ],
        images: [
          { url: 'https://picsum.photos/400?random=1008', alt: 'Tapete de Atividades Floresta', isDefault: true },
          { url: 'https://picsum.photos/400?random=1009', alt: 'Bebê brincando no Tapete de Atividades Floresta' },
          { url: 'https://picsum.photos/400?random=1010', alt: 'Detalhes dos brinquedos do Tapete de Atividades Floresta' }
        ]
      },
      {
        name: 'Cadeira de Alimentação Multifuncional',
        categoryName: 'Alimentação',
        shortDescription: 'Cadeira de alimentação ajustável e multifuncional',
        description: `
          <h2>Cadeira de Alimentação Multifuncional</h2>
          <p>A Cadeira de Alimentação Multifuncional é ideal para acompanhar o crescimento do bebê. Com múltiplas configurações, serve desde os primeiros meses até a fase infantil.</p>
          <h3>Características:</h3>
          <ul>
            <li>7 níveis de altura</li>
            <li>5 posições de reclinação</li>
            <li>Bandeja removível</li>
            <li>Cinto de segurança de 5 pontos</li>
            <li>Pode ser convertida em cadeira de atividades</li>
            <li>Rodízios com travas</li>
            <li>Capa removível e lavável</li>
          </ul>
          <h3>Especificações:</h3>
          <p>Peso máximo suportado: 15kg<br>Material: Plástico e aço<br>Dimensões montada: 105cm x 60cm x 80cm</p>
        `,
        price: 459.90,
        compareAtPrice: 599.90,
        sku: 'CADEIRA-ALIM-001',
        stock: 8,
        isVariable: true,
        weight: 8.5,
        width: 60,
        height: 105,
        length: 80,
        attributes: [
          { typeId: ageGroupTypeId, value: '6 meses a 3 anos' }
        ],
        variants: [
          { sku: 'CADEIRA-ALIM-AZ', price: 459.90, stock: 3, attributes: [{ typeId: colorTypeId, value: 'Azul' }] },
          { sku: 'CADEIRA-ALIM-RS', price: 459.90, stock: 3, attributes: [{ typeId: colorTypeId, value: 'Rosa' }] },
          { sku: 'CADEIRA-ALIM-VD', price: 459.90, stock: 2, attributes: [{ typeId: colorTypeId, value: 'Verde' }] }
        ],
        images: [
          { url: 'https://picsum.photos/400?random=1011', alt: 'Cadeira de Alimentação Multifuncional', isDefault: true },
          { url: 'https://picsum.photos/400?random=1012', alt: 'Cadeira de Alimentação Multifuncional - Azul' },
          { url: 'https://picsum.photos/400?random=1013', alt: 'Cadeira de Alimentação Multifuncional - Rosa' },
          { url: 'https://picsum.photos/400?random=1014', alt: 'Cadeira de Alimentação Multifuncional - Verde' }
        ]
      }
    ];
    
    // Prepared statements para inserção de produtos
    const insertProduct = db.prepare(`
      INSERT INTO products (
        vendor_id, category_id, name, description, short_description, 
        sku, price, compare_at_price, is_variable, has_special_shipping,
        weight, width, height, length, is_active, is_featured, slug, stock
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `);
    
    const insertProductAttribute = db.prepare(`
      INSERT INTO product_attribute_values (
        attribute_type_id, product_id, variant_id, value
      )
      VALUES (?, ?, ?, ?)
    `);
    
    const insertProductImage = db.prepare(`
      INSERT INTO product_images (
        product_id, variant_id, image_url, alt, is_default, display_order
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    const insertProductVariant = db.prepare(`
      INSERT INTO product_variants (
        product_id, sku, price, compare_at_price, stock, is_active
      )
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    
    // Inserir cada produto
    products.forEach(product => {
      // Encontrar categoria por nome
      const categoryId = findCategoryId(product.categoryName);
      
      if (!categoryId) {
        console.warn(`Categoria não encontrada: ${product.categoryName}. Pulando produto: ${product.name}`);
        return;
      }
      
      // Inserir produto principal
      const slug = generateSlug(product.name);
      const result = insertProduct.run(
        vendorId,
        categoryId,
        product.name,
        product.description,
        product.shortDescription,
        product.sku,
        product.price,
        product.compareAtPrice || null,
        product.isVariable ? 1 : 0,
        product.hasSpecialShipping ? 1 : 0,
        product.weight || null,
        product.width || null,
        product.height || null,
        product.length || null,
        product.isFeatured ? 1 : 0,
        slug,
        product.stock || 0
      );
      
      const productId = result.lastInsertRowid;
      
      // Inserir atributos do produto
      if (product.attributes && product.attributes.length > 0) {
        product.attributes.forEach(attr => {
          insertProductAttribute.run(
            attr.typeId,
            productId,
            null, // variant_id (null para atributos do produto principal)
            attr.value
          );
        });
      }
      
      // Inserir imagens do produto
      if (product.images && product.images.length > 0) {
        product.images.forEach((img, index) => {
          insertProductImage.run(
            productId,
            null, // variant_id (null para imagens do produto principal)
            img.url,
            img.alt || product.name,
            img.isDefault ? 1 : 0,
            index
          );
        });
      }
      
      // Inserir variantes se o produto for variável
      if (product.isVariable && product.variants && product.variants.length > 0) {
        product.variants.forEach(variant => {
          const variantResult = insertProductVariant.run(
            productId,
            variant.sku,
            variant.price,
            variant.compareAtPrice || null,
            variant.stock || 0
          );
          
          const variantId = variantResult.lastInsertRowid;
          
          // Inserir atributos da variante
          if (variant.attributes && variant.attributes.length > 0) {
            variant.attributes.forEach(attr => {
              insertProductAttribute.run(
                attr.typeId,
                productId,
                variantId,
                attr.value
              );
            });
          }
          
          // Inserir imagens específicas da variante, se houver
          if (variant.images && variant.images.length > 0) {
            variant.images.forEach((img, index) => {
              insertProductImage.run(
                productId,
                variantId,
                img.url,
                img.alt || `${product.name} - Variante`,
                img.isDefault ? 1 : 0,
                index
              );
            });
          }
        });
      }
      
      console.log(`Produto inserido: ${product.name} (ID: ${productId})`);
    });
    
    console.log("Seed de produtos concluído com sucesso!");
  } catch (error) {
    console.error("Erro durante o processo de seed de produtos:", error);
    process.exit(1);
  }
}

// Executar seed
seedProductsData().then(() => {
  db.close();
  console.log("Processo de seed de produtos finalizado!");
  process.exit(0);
});