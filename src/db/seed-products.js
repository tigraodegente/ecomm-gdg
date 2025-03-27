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
    
    // Dados para gerar produtos diversos
    const categories = [
      'Alimentação',
      'Berços',
      'Colchões para Berço',
      'Acessórios para berço',
      'Lençóis',
      'Fronhas e Travesseiros',
      'Edredons e Cobertores',
      'Almofadas',
      'Brinquedos para Bebês',
      'Móveis para Quarto',
      'Cadeiras e Poltronas',
      'Kits de Higiene',
      'Bolsas Maternidade',
      'Troca Fraldas',
      'Segurança para Bebê',
      'Roupas de Bebê',
      'Calçados Infantis',
      'Carrinho de Bebê',
      'Suporte para Banho',
      'Saída Maternidade'
    ];
    
    const colors = [
      'Azul',
      'Rosa',
      'Verde',
      'Amarelo',
      'Branco',
      'Cinza',
      'Bege',
      'Marrom',
      'Vermelho',
      'Preto',
      'Roxo',
      'Laranja',
      'Lilás',
      'Turquesa',
      'Multicor'
    ];
    
    const materials = [
      'Algodão',
      'Poliéster',
      'Madeira',
      'MDF',
      'Plástico',
      'Metal',
      'Bambu',
      'Espuma',
      'Malha',
      'Microfibra',
      'Linho',
      'Silicone',
      'Acrílico',
      'Látex',
      'Nylon'
    ];
    
    const sizes = [
      'PP',
      'P',
      'M',
      'G',
      'GG',
      'Padrão',
      'Americano',
      'Mini',
      'Berço',
      'Infantil',
      'Único',
      '0-3 meses',
      '3-6 meses',
      '6-12 meses',
      '12-24 meses'
    ];
    
    const ageGroups = [
      '0 a 3 meses',
      '3 a 6 meses',
      '6 a 12 meses',
      '1 a 2 anos',
      '2 a 3 anos',
      '3 a 4 anos',
      '4 a 5 anos',
      '0 a 12 meses',
      '0 a 24 meses',
      '6 meses a 3 anos',
      'Recém-nascido',
      'Todas as idades'
    ];
    
    // Nomes de produtos para diferentes categorias
    const productNamesByCategory = {
      'Alimentação': [
        'Cadeira de Alimentação Multifuncional',
        'Kit de Utensílios para Alimentação',
        'Babador Impermeável',
        'Bandeja de Alimentação',
        'Porta Papinha Térmico',
        'Mamadeira Anticólica',
        'Copo de Transição',
        'Processador de Alimentos para Bebê',
        'Conjunto de Pratos e Talheres Infantis',
        'Garrafa Térmica Infantil'
      ],
      'Berços': [
        'Berço Montessoriano Basic',
        'Berço 3 em 1 Convertível',
        'Mini Berço Dobrável',
        'Berço Multifuncional com Trocador',
        'Berço de Viagem Portátil',
        'Berço Americano Premium',
        'Berço com Balanço',
        'Berço Estilo Retrô',
        'Berço 4 em 1 com Cômoda',
        'Berço Sidebyside'
      ],
      'Colchões para Berço': [
        'Colchão de Berço Ortopédico',
        'Colchão para Mini Berço',
        'Colchão de Espuma D28',
        'Colchão Impermeável para Berço',
        'Colchão de Fibra Natural',
        'Colchão Antialérgico Infantil',
        'Colchão para Berço Americano',
        'Protetor de Colchão Impermeável',
        'Colchão com Espuma Viscoelástica',
        'Colchão de Látex Natural para Berço'
      ],
      'Acessórios para berço': [
        'Móbile Musical Estrelas',
        'Protetor de Berço Acolchoado',
        'Kit Mosquiteiro para Berço',
        'Grade de Proteção',
        'Suporte para Dossel',
        'Luminária para Berço',
        'Monitor de Som e Imagem',
        'Carrossel Musical',
        'Trocador de Fraldas para Berço',
        'Projetor de Luz Noturna'
      ],
      'Lençóis': [
        'Kit Berço Nuvem Azul',
        'Lençol com Elástico para Berço',
        'Jogo de Lençóis Infantil',
        'Lençol Térmico para Berço',
        'Kit Lençol e Fronha',
        'Lençol Impermeável',
        'Lençol de Malha para Berço',
        'Kit Berço 3 Peças',
        'Lençol Avulso Estampado',
        'Lençol Infantil 100% Algodão'
      ]
    };
    
    // Para outras categorias, usaremos nomes genéricos
    for (const category of categories) {
      if (!productNamesByCategory[category]) {
        productNamesByCategory[category] = [];
        for (let i = 1; i <= 10; i++) {
          productNamesByCategory[category].push(`${category} Premium ${i}`);
        }
      }
    }
    
    // Função para gerar descrição aleatória para o produto
    function generateDescription(name, categoryName) {
      return `
        <h2>${name}</h2>
        <p>Produto de alta qualidade da categoria ${categoryName}, ideal para o conforto e desenvolvimento do seu bebê.</p>
        <h3>Características:</h3>
        <ul>
          <li>Design moderno e seguro</li>
          <li>Material de alta qualidade</li>
          <li>Fácil de limpar</li>
          <li>Certificado pelo INMETRO</li>
          <li>Durável e resistente</li>
        </ul>
        <h3>Especificações:</h3>
        <p>Consulte as dimensões no manual do produto.<br>Garantia de 3 meses contra defeitos de fabricação.</p>
      `;
    }
    
    // Gerar 100 produtos variados
    const products = [];
    let imageCounter = 1001; // Contador para gerar URLs de imagens únicas
    
    for (let i = 0; i < 100; i++) {
      // Escolher categoria aleatória
      const categoryIndex = i % categories.length;
      const categoryName = categories[categoryIndex];
      
      // Escolher nome de produto para a categoria
      const nameIndex = i % productNamesByCategory[categoryName].length;
      let name = productNamesByCategory[categoryName][nameIndex];
      
      // Adicionar um sufixo para evitar nomes duplicados
      if (i >= productNamesByCategory[categoryName].length) {
        const variant = Math.floor(i / productNamesByCategory[categoryName].length) + 1;
        name = `${name} v${variant}`;
      }
      
      // Gerar preço base entre 50 e 1000
      const basePrice = 50 + Math.floor(Math.random() * 950);
      // Desconto entre 0% e 40%
      const discountPercent = Math.floor(Math.random() * 41);
      const priceAfterDiscount = basePrice * (1 - discountPercent / 100);
      
      // Produto variável (com tamanhos, cores) ou não
      let isVariable = Math.random() > 0.5;
      
      // Atributos do produto
      const attributes = [];
      
      // Adicionar atributo de material (75% dos produtos)
      if (Math.random() < 0.75) {
        const materialIndex = Math.floor(Math.random() * materials.length);
        attributes.push({ typeId: materialTypeId, value: materials[materialIndex] });
      }
      
      // Adicionar atributo de faixa etária (90% dos produtos)
      if (Math.random() < 0.9) {
        const ageGroupIndex = Math.floor(Math.random() * ageGroups.length);
        attributes.push({ typeId: ageGroupTypeId, value: ageGroups[ageGroupIndex] });
      }
      
      // Se não for variável, pode ter uma cor fixa (50% dos produtos não variáveis)
      if (!isVariable && Math.random() < 0.5) {
        const colorIndex = Math.floor(Math.random() * colors.length);
        attributes.push({ typeId: colorTypeId, value: colors[colorIndex] });
      }
      
      // Gerar variantes se o produto for variável
      const variants = [];
      if (isVariable) {
        // Determinar quais variantes teremos (cor, tamanho ou ambos)
        const hasColorVariants = Math.random() < 0.7;
        const hasSizeVariants = Math.random() < 0.6;
        
        if (hasColorVariants && hasSizeVariants) {
          // Variantes com cor e tamanho
          const numColors = 2 + Math.floor(Math.random() * 3); // 2-4 cores
          const numSizes = 2 + Math.floor(Math.random() * 3); // 2-4 tamanhos
          
          for (let c = 0; c < numColors; c++) {
            const colorIndex = Math.floor(Math.random() * colors.length);
            for (let s = 0; s < numSizes; s++) {
              const sizeIndex = Math.floor(Math.random() * sizes.length);
              // Calcular preço da variante (±10% do preço base)
              const variantPrice = priceAfterDiscount * (0.9 + Math.random() * 0.2);
              variants.push({
                sku: `${name.replace(/\s+/g, '-').toUpperCase()}-${c+1}-${s+1}`.substring(0, 20),
                price: Math.round(variantPrice * 100) / 100,
                stock: 1 + Math.floor(Math.random() * 20),
                attributes: [
                  { typeId: colorTypeId, value: colors[colorIndex] },
                  { typeId: sizeTypeId, value: sizes[sizeIndex] }
                ]
              });
            }
          }
        } else if (hasColorVariants) {
          // Apenas variantes de cor
          const numColors = 2 + Math.floor(Math.random() * 4); // 2-5 cores
          for (let c = 0; c < numColors; c++) {
            const colorIndex = Math.floor(Math.random() * colors.length);
            const variantPrice = priceAfterDiscount * (0.95 + Math.random() * 0.1);
            variants.push({
              sku: `${name.replace(/\s+/g, '-').toUpperCase()}-${colors[colorIndex].substring(0, 2)}`.substring(0, 20),
              price: Math.round(variantPrice * 100) / 100,
              stock: 1 + Math.floor(Math.random() * 20),
              attributes: [
                { typeId: colorTypeId, value: colors[colorIndex] }
              ]
            });
          }
        } else if (hasSizeVariants) {
          // Apenas variantes de tamanho
          const numSizes = 2 + Math.floor(Math.random() * 4); // 2-5 tamanhos
          for (let s = 0; s < numSizes; s++) {
            const sizeIndex = Math.floor(Math.random() * sizes.length);
            const variantPrice = priceAfterDiscount * (0.9 + Math.random() * 0.2);
            variants.push({
              sku: `${name.replace(/\s+/g, '-').toUpperCase()}-${sizes[sizeIndex]}`.substring(0, 20),
              price: Math.round(variantPrice * 100) / 100,
              stock: 1 + Math.floor(Math.random() * 20),
              attributes: [
                { typeId: sizeTypeId, value: sizes[sizeIndex] }
              ]
            });
          }
        } else {
          // Produto variável sem variantes específicas
          isVariable = false;
        }
      }
      
      // Gerar imagens
      const numImages = 1 + Math.floor(Math.random() * 3); // 1-3 imagens
      const images = [];
      for (let j = 0; j < numImages; j++) {
        images.push({
          url: `https://picsum.photos/400?random=${imageCounter++}`,
          alt: `${name} - Imagem ${j+1}`,
          isDefault: j === 0
        });
      }
      
      // Construir objeto do produto
      const product = {
        name,
        categoryName,
        shortDescription: `${name} - ${categoryName}`,
        description: generateDescription(name, categoryName),
        price: basePrice,
        compareAtPrice: discountPercent > 0 ? basePrice : null,
        sku: name.replace(/\s+/g, '-').toUpperCase().substring(0, 20),
        stock: 5 + Math.floor(Math.random() * 30),
        isVariable,
        weight: 0.5 + Math.random() * 9.5, // 0.5kg - 10kg
        isFeatured: Math.random() < 0.2, // 20% dos produtos são destaque
        attributes,
        images
      };
      
      if (variants.length > 0) {
        product.variants = variants;
      }
      
      products.push(product);
    }
    
    // Adicionar alguns produtos específicos para garantir testes de combinações
    const specificProducts = [
      {
        name: 'Berço Multifuncional Combinado',
        categoryName: 'Berços',
        shortDescription: 'Berço com múltiplas funcionalidades e opções',
        description: generateDescription('Berço Multifuncional Combinado', 'Berços'),
        price: 899.90,
        compareAtPrice: 999.90,
        sku: 'BERCO-MULTI-COMB',
        stock: 10,
        isVariable: true,
        weight: 15.0,
        isFeatured: true,
        attributes: [
          { typeId: materialTypeId, value: 'Madeira' },
          { typeId: ageGroupTypeId, value: '0 a 24 meses' }
        ],
        variants: [
          { sku: 'BERCO-MULTI-COMB-AZ-P', price: 899.90, stock: 3, attributes: [
            { typeId: colorTypeId, value: 'Azul' },
            { typeId: sizeTypeId, value: 'P' }
          ]},
          { sku: 'BERCO-MULTI-COMB-AZ-M', price: 929.90, stock: 2, attributes: [
            { typeId: colorTypeId, value: 'Azul' },
            { typeId: sizeTypeId, value: 'M' }
          ]},
          { sku: 'BERCO-MULTI-COMB-RS-P', price: 899.90, stock: 2, attributes: [
            { typeId: colorTypeId, value: 'Rosa' },
            { typeId: sizeTypeId, value: 'P' }
          ]},
          { sku: 'BERCO-MULTI-COMB-RS-M', price: 929.90, stock: 3, attributes: [
            { typeId: colorTypeId, value: 'Rosa' },
            { typeId: sizeTypeId, value: 'M' }
          ]}
        ],
        images: [
          { url: `https://picsum.photos/400?random=${imageCounter++}`, alt: 'Berço Multifuncional Combinado', isDefault: true },
          { url: `https://picsum.photos/400?random=${imageCounter++}`, alt: 'Berço Multifuncional Combinado - Detalhe' }
        ]
      },
      {
        name: 'Kit Alimentação Completo',
        categoryName: 'Alimentação',
        shortDescription: 'Kit completo com todos os itens para alimentação do bebê',
        description: generateDescription('Kit Alimentação Completo', 'Alimentação'),
        price: 189.90,
        compareAtPrice: 249.90,
        sku: 'KIT-ALIM-COMPLETO',
        stock: 15,
        isVariable: true,
        weight: 2.0,
        isFeatured: true,
        attributes: [
          { typeId: materialTypeId, value: 'Plástico' },
          { typeId: ageGroupTypeId, value: '6 a 12 meses' }
        ],
        variants: [
          { sku: 'KIT-ALIM-COMP-AZ', price: 189.90, stock: 5, attributes: [
            { typeId: colorTypeId, value: 'Azul' }
          ]},
          { sku: 'KIT-ALIM-COMP-RS', price: 189.90, stock: 5, attributes: [
            { typeId: colorTypeId, value: 'Rosa' }
          ]},
          { sku: 'KIT-ALIM-COMP-VD', price: 189.90, stock: 5, attributes: [
            { typeId: colorTypeId, value: 'Verde' }
          ]}
        ],
        images: [
          { url: `https://picsum.photos/400?random=${imageCounter++}`, alt: 'Kit Alimentação Completo', isDefault: true },
          { url: `https://picsum.photos/400?random=${imageCounter++}`, alt: 'Kit Alimentação Completo - Itens' }
        ]
      },
      {
        name: 'Cama Infantil Multitema',
        categoryName: 'Móveis para Quarto',
        shortDescription: 'Cama infantil com opções de tema e tamanho',
        description: generateDescription('Cama Infantil Multitema', 'Móveis para Quarto'),
        price: 599.90,
        compareAtPrice: 699.90,
        sku: 'CAMA-INF-MULTI',
        stock: 8,
        isVariable: true,
        weight: 25.0,
        isFeatured: true,
        attributes: [
          { typeId: materialTypeId, value: 'MDF' },
          { typeId: ageGroupTypeId, value: '2 a 3 anos' }
        ],
        variants: [
          { sku: 'CAMA-INF-MULTI-AZ-P', price: 599.90, stock: 2, attributes: [
            { typeId: colorTypeId, value: 'Azul' },
            { typeId: sizeTypeId, value: 'P' }
          ]},
          { sku: 'CAMA-INF-MULTI-RS-P', price: 599.90, stock: 2, attributes: [
            { typeId: colorTypeId, value: 'Rosa' },
            { typeId: sizeTypeId, value: 'P' }
          ]},
          { sku: 'CAMA-INF-MULTI-AZ-M', price: 649.90, stock: 2, attributes: [
            { typeId: colorTypeId, value: 'Azul' },
            { typeId: sizeTypeId, value: 'M' }
          ]},
          { sku: 'CAMA-INF-MULTI-RS-M', price: 649.90, stock: 2, attributes: [
            { typeId: colorTypeId, value: 'Rosa' },
            { typeId: sizeTypeId, value: 'M' }
          ]}
        ],
        images: [
          { url: `https://picsum.photos/400?random=${imageCounter++}`, alt: 'Cama Infantil Multitema', isDefault: true },
          { url: `https://picsum.photos/400?random=${imageCounter++}`, alt: 'Cama Infantil Multitema - Lateral' }
        ]
      }
    ];
    
    // Adicionar produtos específicos à lista
    products.push(...specificProducts);
    
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