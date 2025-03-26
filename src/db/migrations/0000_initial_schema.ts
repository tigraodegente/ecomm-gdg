import { migrate } from "drizzle-orm/sqlite-core/migrator";
import { db } from "../config";
import * as schema from "../schema";
import { sql } from "drizzle-orm";

export async function up() {
  // Criar tabelas principais em ordem para respeitar as relações

  // 1. Categorias (recursivo com parentId)
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      parent_id INTEGER,
      image_url TEXT,
      display_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES categories(id)
    )
  `);

  // 2. CIDs para Categorias
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS category_identifiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      cid TEXT NOT NULL UNIQUE,
      is_default INTEGER DEFAULT 0,
      language TEXT DEFAULT 'pt-BR',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )
  `);

  // 3. Tabela de Usuários (base do Better-auth)
  await db.run(sql`
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

  // 4. Perfis de Usuários
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS user_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL UNIQUE,
      phone_number TEXT,
      cpf TEXT,
      date_of_birth TEXT,
      preferred_language TEXT DEFAULT 'pt-BR',
      newsletter_opt_in INTEGER DEFAULT 0,
      marketing_opt_in INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES User(id)
    )
  `);

  // 5. Vendedores/Lojistas
  await db.run(sql`
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
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES User(id)
    )
  `);

  // 6. Configurações de Vendedor
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS vendor_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER NOT NULL UNIQUE,
      allows_returns INTEGER DEFAULT 1,
      return_period_days INTEGER DEFAULT 7,
      shipping_policy TEXT,
      return_policy TEXT,
      min_order_value REAL DEFAULT 0,
      free_shipping_threshold REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vendor_id) REFERENCES vendors(id)
    )
  `);

  // 7. Endereços
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      vendor_id INTEGER,
      name TEXT NOT NULL,
      recipient_name TEXT NOT NULL,
      street TEXT NOT NULL,
      number TEXT NOT NULL,
      complement TEXT,
      neighborhood TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      postal_code TEXT NOT NULL,
      country TEXT DEFAULT 'Brasil',
      phone TEXT,
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES User(id),
      FOREIGN KEY (vendor_id) REFERENCES vendors(id),
      CHECK (
        (user_id IS NOT NULL AND vendor_id IS NULL) OR
        (user_id IS NULL AND vendor_id IS NOT NULL)
      )
    )
  `);

  // 8. Produtos
  await db.run(sql`
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
      FOREIGN KEY (vendor_id) REFERENCES vendors(id),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )
  `);

  // 9. Tipos de Atributos de Produtos
  await db.run(sql`
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

  // 10. Variantes de Produto
  await db.run(sql`
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

  // 11. Valores de Atributos de Produto
  await db.run(sql`
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

  // 12. Imagens de Produtos
  await db.run(sql`
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

  // 13. Avaliações de Produtos
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS product_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      rating REAL NOT NULL,
      title TEXT,
      comment TEXT,
      is_verified_purchase INTEGER DEFAULT 0,
      is_approved INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (user_id) REFERENCES User(id),
      UNIQUE(user_id, product_id)
    )
  `);

  // 14. Status de Pedido
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS order_statuses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      description TEXT,
      color TEXT,
      is_default INTEGER DEFAULT 0,
      is_final INTEGER DEFAULT 0,
      display_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 15. Pedidos
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      order_number TEXT NOT NULL UNIQUE,
      status_id INTEGER NOT NULL,
      total_amount REAL NOT NULL DEFAULT 0,
      subtotal_amount REAL NOT NULL DEFAULT 0,
      shipping_amount REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      shipping_address_id INTEGER,
      billing_address_id INTEGER,
      notes TEXT,
      cancel_reason TEXT,
      is_paid INTEGER DEFAULT 0,
      invoice_url TEXT,
      estimated_delivery_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES User(id),
      FOREIGN KEY (status_id) REFERENCES order_statuses(id),
      FOREIGN KEY (shipping_address_id) REFERENCES addresses(id),
      FOREIGN KEY (billing_address_id) REFERENCES addresses(id)
    )
  `);

  // 16. Histórico de Status do Pedido
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS order_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      status_id INTEGER NOT NULL,
      notes TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (status_id) REFERENCES order_statuses(id)
    )
  `);

  // 17. Itens de Pedido
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      variant_id INTEGER,
      vendor_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      discount_amount REAL DEFAULT 0,
      shipping_amount REAL DEFAULT 0,
      item_status TEXT DEFAULT 'pending',
      estimated_delivery_date TEXT,
      shipping_tracking_code TEXT,
      shipping_carrier TEXT,
      is_reviewed INTEGER DEFAULT 0,
      product_snapshot TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (variant_id) REFERENCES product_variants(id),
      FOREIGN KEY (vendor_id) REFERENCES vendors(id)
    )
  `);

  // 18. Pagamentos
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'pending',
      transaction_id TEXT,
      payment_gateway TEXT,
      gateway_response TEXT,
      card_last_four TEXT,
      card_brand TEXT,
      installments INTEGER DEFAULT 1,
      payment_url TEXT,
      expires_at TEXT,
      paid_at TEXT,
      refunded_at TEXT,
      refund_amount REAL,
      refund_reason TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `);

  // 19. Carrinhos
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS carts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      session_id TEXT,
      shipping_address_id INTEGER,
      coupon_code TEXT,
      subtotal_amount REAL DEFAULT 0,
      shipping_amount REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT,
      FOREIGN KEY (user_id) REFERENCES User(id),
      FOREIGN KEY (shipping_address_id) REFERENCES addresses(id),
      CHECK (
        (user_id IS NOT NULL AND session_id IS NULL) OR
        (user_id IS NULL AND session_id IS NOT NULL)
      )
    )
  `);

  // 20. Itens de Carrinho
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS cart_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cart_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      variant_id INTEGER,
      vendor_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      shipping_amount REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cart_id) REFERENCES carts(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (variant_id) REFERENCES product_variants(id),
      FOREIGN KEY (vendor_id) REFERENCES vendors(id)
    )
  `);

  // 21. Cupons de Desconto
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      description TEXT,
      discount_type TEXT NOT NULL,
      discount_amount REAL NOT NULL,
      minimum_order_amount REAL DEFAULT 0,
      maximum_discount_amount REAL,
      start_date TEXT DEFAULT CURRENT_TIMESTAMP,
      end_date TEXT,
      usage_limit INTEGER,
      per_user_limit INTEGER,
      usage_count INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 22. Regras de Cupons
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS coupon_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coupon_id INTEGER NOT NULL,
      rule_type TEXT NOT NULL,
      rule_id INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (coupon_id) REFERENCES coupons(id)
    )
  `);

  // 23. Regras de Frete por Vendedor
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS vendor_shipping_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      min_order_value REAL DEFAULT 0,
      free_shipping_threshold REAL,
      calculation_type TEXT NOT NULL,
      default_price REAL DEFAULT 0,
      price_per_kg REAL,
      percentage_value REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vendor_id) REFERENCES vendors(id)
    )
  `);

  // 24. Faixas de CEP para cálculo de frete
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS shipping_postal_code_ranges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id INTEGER NOT NULL,
      postal_code_start TEXT NOT NULL,
      postal_code_end TEXT NOT NULL,
      price REAL NOT NULL,
      delivery_days INTEGER NOT NULL,
      region TEXT,
      state TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (rule_id) REFERENCES vendor_shipping_rules(id)
    )
  `);

  // 25. Frete por Produto (para produtos com frete especial)
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS product_shipping (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      has_special_shipping INTEGER DEFAULT 1,
      is_fixed_price INTEGER DEFAULT 0,
      fixed_price REAL,
      weight_multiplier REAL,
      override_default INTEGER DEFAULT 1,
      rule_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (rule_id) REFERENCES vendor_shipping_rules(id)
    )
  `);

  // 26. Prazos de Entrega por região
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS delivery_deadlines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER NOT NULL,
      region TEXT NOT NULL,
      state TEXT,
      city TEXT,
      postal_code_prefix TEXT,
      delivery_days INTEGER NOT NULL,
      additional_days INTEGER DEFAULT 0,
      handling_days INTEGER DEFAULT 1,
      is_business_days INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vendor_id) REFERENCES vendors(id)
    )
  `);

  // 27. Consolidação de Frete (para multi-vendedor)
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS shipping_consolidation_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      consolidation_type TEXT NOT NULL,
      apply_discount INTEGER DEFAULT 0,
      discount_percentage REAL DEFAULT 0,
      max_vendors INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 28. Links de Menu (não-categorias)
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS menu_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      parent_id INTEGER,
      open_in_new_tab INTEGER DEFAULT 0,
      position TEXT NOT NULL,
      display_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      requires_auth INTEGER DEFAULT 0,
      icon TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES menu_links(id)
    )
  `);

  // 29. Banners
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS banners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      subtitle TEXT,
      image_url TEXT NOT NULL,
      mobile_image_url TEXT,
      alt TEXT,
      link_url TEXT,
      button_text TEXT,
      position TEXT NOT NULL,
      display_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      start_date TEXT DEFAULT CURRENT_TIMESTAMP,
      end_date TEXT,
      category_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )
  `);

  // 30. Páginas Estáticas (CMS)
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS static_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL,
      meta_title TEXT,
      meta_description TEXT,
      is_active INTEGER DEFAULT 1,
      requires_auth INTEGER DEFAULT 0,
      template TEXT DEFAULT 'default',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      published_at TEXT
    )
  `);

  // 31. Blocos de Conteúdo Reutilizáveis
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS content_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      identifier TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL,
      position TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 32. Configurações SEO
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS seo_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_type TEXT NOT NULL,
      page_identifier TEXT,
      title TEXT,
      meta_description TEXT,
      meta_keywords TEXT,
      og_title TEXT,
      og_description TEXT,
      og_image_url TEXT,
      canonical_url TEXT,
      structured_data TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 33. Configurações Globais
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS global_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      is_public INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log("Migration 0000_initial_schema executada com sucesso!");
}

export async function down() {
  // Lista de tabelas em ordem reversa de dependência para o rollback
  const tables = [
    "global_settings",
    "seo_settings",
    "content_blocks",
    "static_pages",
    "banners",
    "menu_links",
    "shipping_consolidation_rules",
    "delivery_deadlines",
    "product_shipping",
    "shipping_postal_code_ranges",
    "vendor_shipping_rules",
    "coupon_rules",
    "coupons",
    "cart_items",
    "carts",
    "payments",
    "order_items",
    "order_status_history",
    "orders",
    "order_statuses",
    "product_reviews",
    "product_images",
    "product_attribute_values",
    "product_variants",
    "product_attribute_types",
    "products",
    "addresses",
    "vendor_settings",
    "vendors",
    "user_profiles",
    "category_identifiers",
    "categories"
  ];

  // Desativar restrições de chave estrangeira temporariamente
  await db.run(sql`PRAGMA foreign_keys = OFF;`);

  // Remover cada tabela
  for (const table of tables) {
    await db.run(sql`DROP TABLE IF EXISTS ${sql.identifier(table)}`);
  }

  // Reativar restrições de chave estrangeira
  await db.run(sql`PRAGMA foreign_keys = ON;`);

  console.log("Rollback da migration 0000_initial_schema completado!");
}