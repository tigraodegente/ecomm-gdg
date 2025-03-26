import { relations, sql } from "drizzle-orm";
import { 
  sqliteTable, 
  text, 
  integer, 
  unique, 
  primaryKey,
  real, 
  blob
} from "drizzle-orm/sqlite-core";

// Tabela de Categorias (hierárquica)
export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  parentId: integer('parent_id').references(() => categories.id),
  imageUrl: text('image_url'),
  displayOrder: integer('display_order').default(0),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para categorias (hierarquia)
export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
  }),
  children: many(categories),
  categoryIdentifiers: many(categoryIdentifiers),
  products: many(products),
}));

// Tabela de CIDs (Category Identifiers) para uso em URLs e identificação
export const categoryIdentifiers = sqliteTable('category_identifiers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  categoryId: integer('category_id').notNull().references(() => categories.id),
  cid: text('cid').notNull().unique(), // identificador único para uso em URLs (slug)
  isDefault: integer('is_default', { mode: 'boolean' }).default(false),
  language: text('language').default('pt-BR'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para CIDs
export const categoryIdentifiersRelations = relations(categoryIdentifiers, ({ one }) => ({
  category: one(categories, {
    fields: [categoryIdentifiers.categoryId],
    references: [categories.id],
  }),
}));

// Tabela de Vendedores/Lojistas
export const vendors = sqliteTable('vendors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id), 
  shopName: text('shop_name').notNull(),
  description: text('description'),
  logoUrl: text('logo_url'),
  bannerUrl: text('banner_url'),
  email: text('email').notNull(),
  phone: text('phone'),
  websiteUrl: text('website_url'),
  commissionRate: real('commission_rate').default(0),
  isApproved: integer('is_approved', { mode: 'boolean' }).default(false),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  approvedAt: text('approved_at'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para Vendedores
export const vendorsRelations = relations(vendors, ({ one, many }) => ({
  user: one(users, {
    fields: [vendors.userId],
    references: [users.id],
  }),
  products: many(products),
  vendorSettings: one(vendorSettings),
}));

// Configurações de Vendedor
export const vendorSettings = sqliteTable('vendor_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  vendorId: integer('vendor_id').notNull().references(() => vendors.id).unique(),
  allowsReturns: integer('allows_returns', { mode: 'boolean' }).default(true),
  returnPeriodDays: integer('return_period_days').default(7),
  shippingPolicy: text('shipping_policy'),
  returnPolicy: text('return_policy'),
  minOrderValue: real('min_order_value').default(0),
  freeShippingThreshold: real('free_shipping_threshold'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para Configurações de Vendedor
export const vendorSettingsRelations = relations(vendorSettings, ({ one }) => ({
  vendor: one(vendors, {
    fields: [vendorSettings.vendorId],
    references: [vendors.id],
  }),
}));

// Tabela de Produtos
export const products = sqliteTable('products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  vendorId: integer('vendor_id').notNull().references(() => vendors.id),
  categoryId: integer('category_id').notNull().references(() => categories.id),
  name: text('name').notNull(),
  description: text('description').notNull(),
  shortDescription: text('short_description'),
  sku: text('sku'),
  price: real('price').notNull(),
  compareAtPrice: real('compare_at_price'), // preço "de" (riscado)
  isVariable: integer('is_variable', { mode: 'boolean' }).default(false), // indica se o produto tem variantes
  hasSpecialShipping: integer('has_special_shipping', { mode: 'boolean' }).default(false),
  weight: real('weight'), // em kg
  width: real('width'), // em cm
  height: real('height'), // em cm
  length: real('length'), // em cm
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  isFeatured: integer('is_featured', { mode: 'boolean' }).default(false),
  slug: text('slug').notNull(),
  stock: integer('stock').default(0),
  lowStockThreshold: integer('low_stock_threshold').default(5),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para Produtos
export const productsRelations = relations(products, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [products.vendorId],
    references: [vendors.id],
  }),
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  productImages: many(productImages),
  productVariants: many(productVariants),
  productAttributes: many(productAttributeValues),
  reviews: many(productReviews),
}));

// Tabela de Imagens de Produtos
export const productImages = sqliteTable('product_images', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull().references(() => products.id),
  variantId: integer('variant_id').references(() => productVariants.id),
  imageUrl: text('image_url').notNull(),
  alt: text('alt'),
  isDefault: integer('is_default', { mode: 'boolean' }).default(false),
  displayOrder: integer('display_order').default(0),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para Imagens de Produtos
export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, {
    fields: [productImages.productId],
    references: [products.id],
  }),
  variant: one(productVariants, {
    fields: [productImages.variantId],
    references: [productVariants.id],
    relationName: 'variantImages',
  }),
}));

// Tabela de Tipos de Atributos de Produtos
export const productAttributeTypes = sqliteTable('product_attribute_types', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  displayName: text('display_name').notNull(),
  description: text('description'),
  isVisibleInFilters: integer('is_visible_in_filters', { mode: 'boolean' }).default(true),
  displayOrder: integer('display_order').default(0),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para Tipos de Atributos
export const productAttributeTypesRelations = relations(productAttributeTypes, ({ many }) => ({
  attributeValues: many(productAttributeValues),
}));

// Tabela de Valores de Atributos de Produto
export const productAttributeValues = sqliteTable('product_attribute_values', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  attributeTypeId: integer('attribute_type_id').notNull().references(() => productAttributeTypes.id),
  productId: integer('product_id').notNull().references(() => products.id),
  variantId: integer('variant_id').references(() => productVariants.id),
  value: text('value').notNull(),
  displayValue: text('display_value'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para Valores de Atributos
export const productAttributeValuesRelations = relations(productAttributeValues, ({ one }) => ({
  attributeType: one(productAttributeTypes, {
    fields: [productAttributeValues.attributeTypeId],
    references: [productAttributeTypes.id],
  }),
  product: one(products, {
    fields: [productAttributeValues.productId],
    references: [products.id],
  }),
  variant: one(productVariants, {
    fields: [productAttributeValues.variantId],
    references: [productVariants.id],
    relationName: 'variantAttributes',
  }),
}));

// Tabela de Variantes de Produto
export const productVariants = sqliteTable('product_variants', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull().references(() => products.id),
  sku: text('sku'),
  price: real('price').notNull(),
  compareAtPrice: real('compare_at_price'),
  stock: integer('stock').default(0),
  weight: real('weight'),
  width: real('width'),
  height: real('height'),
  length: real('length'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para Variantes de Produto
export const productVariantsRelations = relations(productVariants, ({ one, many }) => ({
  product: one(products, {
    fields: [productVariants.productId],
    references: [products.id],
  }),
  images: many(productImages, { relationName: 'variantImages' }),
  attributes: many(productAttributeValues, { relationName: 'variantAttributes' }),
}));

// Tabela de Avaliações de Produtos
export const productReviews = sqliteTable('product_reviews', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull().references(() => products.id),
  userId: text('user_id').notNull().references(() => users.id),
  rating: real('rating').notNull(), // 1-5
  title: text('title'),
  comment: text('comment'),
  isVerifiedPurchase: integer('is_verified_purchase', { mode: 'boolean' }).default(false),
  isApproved: integer('is_approved', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => {
  return {
    userProductUnique: unique().on(table.userId, table.productId)
  };
});

// Relações para Avaliações de Produtos
export const productReviewsRelations = relations(productReviews, ({ one }) => ({
  product: one(products, {
    fields: [productReviews.productId],
    references: [products.id],
  }),
  user: one(users, {
    fields: [productReviews.userId],
    references: [users.id],
  }),
}));

// Utilizar a tabela de usuários existente, já definida pelo Better-Auth
export const users = sqliteTable('User', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  emailVerified: integer('emailVerified', { mode: 'boolean' }).default(false),
  image: text('image'),
  createdAt: text('createdAt').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updatedAt').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para Usuários
export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(userProfiles),
  vendor: one(vendors),
  reviews: many(productReviews),
  addresses: many(addresses),
}));

// Tabela de Perfis de Usuário (extensão do Better-auth)
export const userProfiles = sqliteTable('user_profiles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id).unique(),
  phoneNumber: text('phone_number'),
  cpf: text('cpf'),
  dateOfBirth: text('date_of_birth'),
  preferredLanguage: text('preferred_language').default('pt-BR'),
  newsletterOptIn: integer('newsletter_opt_in', { mode: 'boolean' }).default(false),
  marketingOptIn: integer('marketing_opt_in', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para Perfis de Usuário
export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(users, {
    fields: [userProfiles.userId],
    references: [users.id],
  }),
}));

// Tabela de Endereços (para usuários e vendedores)
export const addresses = sqliteTable('addresses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').references(() => users.id),
  vendorId: integer('vendor_id').references(() => vendors.id),
  name: text('name').notNull(), // Ex: "Casa", "Trabalho", etc.
  recipientName: text('recipient_name').notNull(),
  street: text('street').notNull(),
  number: text('number').notNull(),
  complement: text('complement'),
  neighborhood: text('neighborhood').notNull(),
  city: text('city').notNull(),
  state: text('state').notNull(),
  postalCode: text('postal_code').notNull(),
  country: text('country').default('Brasil'),
  phone: text('phone'),
  isDefault: integer('is_default', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => {
  return {
    // Garante que um endereço está associado a um usuário OU a um vendedor
    // Mas não aos dois ao mesmo tempo
    addressTypeCheck: sql`(
      (${table.userId} IS NOT NULL AND ${table.vendorId} IS NULL) OR
      (${table.userId} IS NULL AND ${table.vendorId} IS NOT NULL)
    )`,
  };
});

// Relações para Endereços
export const addressesRelations = relations(addresses, ({ one }) => ({
  user: one(users, {
    fields: [addresses.userId],
    references: [users.id],
  }),
  vendor: one(vendors, {
    fields: [addresses.vendorId],
    references: [vendors.id],
  }),
}));

// Tabela de Status de Pedido
export const orderStatuses = sqliteTable('order_statuses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  displayName: text('display_name').notNull(),
  description: text('description'),
  color: text('color'), // Código de cor para UI
  isDefault: integer('is_default', { mode: 'boolean' }).default(false),
  isFinal: integer('is_final', { mode: 'boolean' }).default(false), // Status final que encerra o ciclo
  displayOrder: integer('display_order').default(0),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para Status de Pedido
export const orderStatusesRelations = relations(orderStatuses, ({ many }) => ({
  orders: many(orders),
}));

// Tabela de Pedidos
export const orders = sqliteTable('orders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id),
  orderNumber: text('order_number').notNull().unique(), // Código do pedido para exibição ao cliente
  statusId: integer('status_id').notNull().references(() => orderStatuses.id),
  totalAmount: real('total_amount').notNull().default(0),
  subtotalAmount: real('subtotal_amount').notNull().default(0),
  shippingAmount: real('shipping_amount').default(0),
  taxAmount: real('tax_amount').default(0),
  discountAmount: real('discount_amount').default(0),
  shippingAddressId: integer('shipping_address_id').references(() => addresses.id),
  billingAddressId: integer('billing_address_id').references(() => addresses.id),
  notes: text('notes'),
  cancelReason: text('cancel_reason'),
  isPaid: integer('is_paid', { mode: 'boolean' }).default(false),
  invoiceUrl: text('invoice_url'),
  estimatedDeliveryDate: text('estimated_delivery_date'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para Pedidos
export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  status: one(orderStatuses, {
    fields: [orders.statusId],
    references: [orderStatuses.id],
  }),
  shippingAddress: one(addresses, {
    fields: [orders.shippingAddressId],
    references: [addresses.id],
    relationName: 'shippingAddress',
  }),
  billingAddress: one(addresses, {
    fields: [orders.billingAddressId],
    references: [addresses.id],
    relationName: 'billingAddress',
  }),
  orderItems: many(orderItems),
  payments: many(payments),
  statusHistory: many(orderStatusHistory),
}));

// Tabela de Histórico de Status do Pedido
export const orderStatusHistory = sqliteTable('order_status_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderId: integer('order_id').notNull().references(() => orders.id),
  statusId: integer('status_id').notNull().references(() => orderStatuses.id),
  notes: text('notes'),
  createdBy: text('created_by'), // ID do usuário ou 'system'
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para Histórico de Status
export const orderStatusHistoryRelations = relations(orderStatusHistory, ({ one }) => ({
  order: one(orders, {
    fields: [orderStatusHistory.orderId],
    references: [orders.id],
  }),
  status: one(orderStatuses, {
    fields: [orderStatusHistory.statusId],
    references: [orderStatuses.id],
  }),
}));

// Tabela de Itens de Pedido
export const orderItems = sqliteTable('order_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderId: integer('order_id').notNull().references(() => orders.id),
  productId: integer('product_id').notNull().references(() => products.id),
  variantId: integer('variant_id').references(() => productVariants.id),
  vendorId: integer('vendor_id').notNull().references(() => vendors.id),
  quantity: integer('quantity').notNull().default(1),
  unitPrice: real('unit_price').notNull(), // Preço no momento da compra
  totalPrice: real('total_price').notNull(), // Preço unitário x quantidade
  discountAmount: real('discount_amount').default(0),
  shippingAmount: real('shipping_amount').default(0),
  itemStatus: text('item_status').default('pending'), // Status específico do item
  estimatedDeliveryDate: text('estimated_delivery_date'),
  shippingTrackingCode: text('shipping_tracking_code'),
  shippingCarrier: text('shipping_carrier'),
  isReviewed: integer('is_reviewed', { mode: 'boolean' }).default(false),
  productSnapshot: text('product_snapshot'), // JSON com dados do produto na hora da compra
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para Itens de Pedido
export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
  variant: one(productVariants, {
    fields: [orderItems.variantId],
    references: [productVariants.id],
  }),
  vendor: one(vendors, {
    fields: [orderItems.vendorId],
    references: [vendors.id],
  }),
}));

// Tabela de Pagamentos
export const payments = sqliteTable('payments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderId: integer('order_id').notNull().references(() => orders.id),
  amount: real('amount').notNull(),
  paymentMethod: text('payment_method').notNull(), // 'credit_card', 'pix', 'boleto', etc.
  paymentStatus: text('payment_status').notNull().default('pending'), // 'pending', 'approved', 'rejected', etc.
  transactionId: text('transaction_id'),
  paymentGateway: text('payment_gateway'),
  gatewayResponse: text('gateway_response'), // JSON com resposta do gateway
  cardLastFour: text('card_last_four'),
  cardBrand: text('card_brand'),
  installments: integer('installments').default(1),
  paymentUrl: text('payment_url'), // URL de pagamento para boletos, pix, etc.
  expiresAt: text('expires_at'), // Data de expiração para formas como boleto
  paidAt: text('paid_at'),
  refundedAt: text('refunded_at'),
  refundAmount: real('refund_amount'),
  refundReason: text('refund_reason'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para Pagamentos
export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, {
    fields: [payments.orderId],
    references: [orders.id],
  }),
}));

// Tabela temporária de Carrinho
export const carts = sqliteTable('carts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').references(() => users.id),
  sessionId: text('session_id'), // Para carrinhos de usuários não autenticados
  shippingAddressId: integer('shipping_address_id').references(() => addresses.id),
  couponCode: text('coupon_code'),
  subtotalAmount: real('subtotal_amount').default(0),
  shippingAmount: real('shipping_amount').default(0),
  taxAmount: real('tax_amount').default(0),
  discountAmount: real('discount_amount').default(0),
  totalAmount: real('total_amount').default(0),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  expiresAt: text('expires_at'), // Data para expirar carrinhos abandonados
}, (table) => {
  return {
    // Garante que um carrinho está associado a um usuário OU a uma sessão
    // Mas não aos dois ao mesmo tempo
    cartUserSession: sql`(
      (${table.userId} IS NOT NULL AND ${table.sessionId} IS NULL) OR
      (${table.userId} IS NULL AND ${table.sessionId} IS NOT NULL)
    )`,
  };
});

// Relações para Carrinho
export const cartsRelations = relations(carts, ({ one, many }) => ({
  user: one(users, {
    fields: [carts.userId],
    references: [users.id],
  }),
  shippingAddress: one(addresses, {
    fields: [carts.shippingAddressId],
    references: [addresses.id],
  }),
  items: many(cartItems),
}));

// Tabela de Itens de Carrinho
export const cartItems = sqliteTable('cart_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cartId: integer('cart_id').notNull().references(() => carts.id),
  productId: integer('product_id').notNull().references(() => products.id),
  variantId: integer('variant_id').references(() => productVariants.id),
  vendorId: integer('vendor_id').notNull().references(() => vendors.id),
  quantity: integer('quantity').notNull().default(1),
  unitPrice: real('unit_price').notNull(),
  totalPrice: real('total_price').notNull(),
  shippingAmount: real('shipping_amount').default(0),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para Itens de Carrinho
export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, {
    fields: [cartItems.cartId],
    references: [carts.id],
  }),
  product: one(products, {
    fields: [cartItems.productId],
    references: [products.id],
  }),
  variant: one(productVariants, {
    fields: [cartItems.variantId],
    references: [productVariants.id],
  }),
  vendor: one(vendors, {
    fields: [cartItems.vendorId],
    references: [vendors.id],
  }),
}));

// Tabela de Cupons de Desconto
export const coupons = sqliteTable('coupons', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(),
  description: text('description'),
  discountType: text('discount_type').notNull(), // 'percentage', 'fixed'
  discountAmount: real('discount_amount').notNull(),
  minimumOrderAmount: real('minimum_order_amount').default(0),
  maximumDiscountAmount: real('maximum_discount_amount'),
  startDate: text('start_date').default(sql`CURRENT_TIMESTAMP`),
  endDate: text('end_date'),
  usageLimit: integer('usage_limit'), // Limite total de usos
  perUserLimit: integer('per_user_limit'), // Limite de usos por usuário
  usageCount: integer('usage_count').default(0),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Tabela de Regras de Cupons (para aplicar a categorias ou vendedores específicos)
export const couponRules = sqliteTable('coupon_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  couponId: integer('coupon_id').notNull().references(() => coupons.id),
  ruleType: text('rule_type').notNull(), // 'category', 'vendor', 'product'
  ruleId: integer('rule_id').notNull(), // ID da categoria, vendedor ou produto
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para Regras de Cupons
export const couponRulesRelations = relations(couponRules, ({ one }) => ({
  coupon: one(coupons, {
    fields: [couponRules.couponId],
    references: [coupons.id],
  }),
}));

// Esquema de Frete e Entrega

// Tabela de Regras de Frete por Vendedor
export const vendorShippingRules = sqliteTable('vendor_shipping_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  vendorId: integer('vendor_id').notNull().references(() => vendors.id),
  name: text('name').notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).default(false),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  minOrderValue: real('min_order_value').default(0),
  freeShippingThreshold: real('free_shipping_threshold'),
  calculationType: text('calculation_type').notNull(), // 'fixed', 'weight_based', 'price_percentage', 'table'
  defaultPrice: real('default_price').default(0),
  pricePerKg: real('price_per_kg'),
  percentageValue: real('percentage_value'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para Regras de Frete por Vendedor
export const vendorShippingRulesRelations = relations(vendorShippingRules, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [vendorShippingRules.vendorId],
    references: [vendors.id],
  }),
  postalCodeRanges: many(shippingPostalCodeRanges),
}));

// Tabela de Faixas de CEP para cálculo de frete
export const shippingPostalCodeRanges = sqliteTable('shipping_postal_code_ranges', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ruleId: integer('rule_id').notNull().references(() => vendorShippingRules.id),
  postalCodeStart: text('postal_code_start').notNull(),
  postalCodeEnd: text('postal_code_end').notNull(),
  price: real('price').notNull(),
  deliveryDays: integer('delivery_days').notNull(),
  region: text('region'), // Ex: "Sudeste", "Nordeste", etc.
  state: text('state'), // Ex: "SP", "RJ", etc.
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para Faixas de CEP
export const shippingPostalCodeRangesRelations = relations(shippingPostalCodeRanges, ({ one }) => ({
  rule: one(vendorShippingRules, {
    fields: [shippingPostalCodeRanges.ruleId],
    references: [vendorShippingRules.id],
  }),
}));

// Tabela de Frete por Produto (para produtos com frete especial)
export const productShipping = sqliteTable('product_shipping', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull().references(() => products.id),
  hasSpecialShipping: integer('has_special_shipping', { mode: 'boolean' }).default(true),
  isFixedPrice: integer('is_fixed_price', { mode: 'boolean' }).default(false),
  fixedPrice: real('fixed_price'),
  weightMultiplier: real('weight_multiplier'), // Multiplicador para cálculos baseados em peso
  overrideDefault: integer('override_default', { mode: 'boolean' }).default(true),
  ruleId: integer('rule_id').references(() => vendorShippingRules.id),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para Frete por Produto
export const productShippingRelations = relations(productShipping, ({ one }) => ({
  product: one(products, {
    fields: [productShipping.productId],
    references: [products.id],
  }),
  rule: one(vendorShippingRules, {
    fields: [productShipping.ruleId],
    references: [vendorShippingRules.id],
  }),
}));

// Tabela de Prazos de Entrega por região
export const deliveryDeadlines = sqliteTable('delivery_deadlines', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  vendorId: integer('vendor_id').notNull().references(() => vendors.id),
  region: text('region').notNull(), // Ex: "Sudeste", "Nordeste", "Sul", etc.
  state: text('state'), // Ex: "SP", "RJ", etc. (opcional)
  city: text('city'), // Para casos específicos (opcional)
  postalCodePrefix: text('postal_code_prefix'), // Para casos específicos (opcional)
  deliveryDays: integer('delivery_days').notNull(),
  additionalDays: integer('additional_days').default(0), // Dias adicionais para cidades remotas
  handlingDays: integer('handling_days').default(1), // Dias para processamento/embalagem antes do envio
  isBusinessDays: integer('is_business_days', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para Prazos de Entrega
export const deliveryDeadlinesRelations = relations(deliveryDeadlines, ({ one }) => ({
  vendor: one(vendors, {
    fields: [deliveryDeadlines.vendorId],
    references: [vendors.id],
  }),
}));

// Tabela de Consolidação de Frete (para multi-vendedor)
export const shippingConsolidationRules = sqliteTable('shipping_consolidation_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  consolidationType: text('consolidation_type').notNull(), // 'best_price', 'avg_price', 'sum_price', 'max_price'
  applyDiscount: integer('apply_discount', { mode: 'boolean' }).default(false),
  discountPercentage: real('discount_percentage').default(0),
  maxVendors: integer('max_vendors'), // Máximo de vendedores para aplicar consolidação
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Esquema de Conteúdo e Configurações

// Tabela de Links de Menu (não-categorias)
export const menuLinks = sqliteTable('menu_links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  url: text('url').notNull(),
  parentId: integer('parent_id').references(() => menuLinks.id),
  openInNewTab: integer('open_in_new_tab', { mode: 'boolean' }).default(false),
  position: text('position').notNull(), // 'header', 'footer', 'sidebar', etc.
  displayOrder: integer('display_order').default(0),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  requiresAuth: integer('requires_auth', { mode: 'boolean' }).default(false),
  icon: text('icon'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para Links de Menu
export const menuLinksRelations = relations(menuLinks, ({ one, many }) => ({
  parent: one(menuLinks, {
    fields: [menuLinks.parentId],
    references: [menuLinks.id],
  }),
  children: many(menuLinks),
}));

// Tabela de Banners
export const banners = sqliteTable('banners', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  subtitle: text('subtitle'),
  imageUrl: text('image_url').notNull(),
  mobileImageUrl: text('mobile_image_url'),
  alt: text('alt'),
  linkUrl: text('link_url'),
  buttonText: text('button_text'),
  position: text('position').notNull(), // 'home_main', 'category_top', etc.
  displayOrder: integer('display_order').default(0),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  startDate: text('start_date').default(sql`CURRENT_TIMESTAMP`),
  endDate: text('end_date'),
  categoryId: integer('category_id').references(() => categories.id),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para Banners
export const bannersRelations = relations(banners, ({ one }) => ({
  category: one(categories, {
    fields: [banners.categoryId],
    references: [categories.id],
  }),
}));

// Tabela de Páginas Estáticas (CMS)
export const staticPages = sqliteTable('static_pages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  content: text('content').notNull(),
  metaTitle: text('meta_title'),
  metaDescription: text('meta_description'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  requiresAuth: integer('requires_auth', { mode: 'boolean' }).default(false),
  template: text('template').default('default'), // 'default', 'full-width', 'sidebar', etc.
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  publishedAt: text('published_at'),
});

// Tabela de Blocos de Conteúdo Reutilizáveis
export const contentBlocks = sqliteTable('content_blocks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  identifier: text('identifier').notNull().unique(),
  content: text('content').notNull(),
  position: text('position').notNull(), // 'home_featured', 'footer_about', etc.
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Tabela de Configurações SEO
export const seoSettings = sqliteTable('seo_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  pageType: text('page_type').notNull(), // 'home', 'category', 'product', 'static', etc.
  pageIdentifier: text('page_identifier'), // ID, slug ou outro identificador
  title: text('title'),
  metaDescription: text('meta_description'),
  metaKeywords: text('meta_keywords'),
  ogTitle: text('og_title'),
  ogDescription: text('og_description'),
  ogImageUrl: text('og_image_url'),
  canonicalUrl: text('canonical_url'),
  structuredData: text('structured_data'), // JSON-LD para schema.org
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Tabela de Configurações Globais
export const globalSettings = sqliteTable('global_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  value: text('value'),
  type: text('type').notNull(), // 'string', 'number', 'boolean', 'json'
  category: text('category').notNull(), // 'payment', 'shipping', 'email', 'site', etc.
  description: text('description'),
  isPublic: integer('is_public', { mode: 'boolean' }).default(false), // Se pode ser acessado pelo frontend
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// ============== Features Adicionais ==============

// Tabela de Wishlist/Lista de Favoritos
export const wishlists = sqliteTable('wishlists', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').default('Favoritos'),
  isPublic: integer('is_public', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para Wishlist
export const wishlistsRelations = relations(wishlists, ({ one, many }) => ({
  user: one(users, {
    fields: [wishlists.userId],
    references: [users.id],
  }),
  items: many(wishlistItems),
}));

// Tabela de Itens de Wishlist
export const wishlistItems = sqliteTable('wishlist_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  wishlistId: integer('wishlist_id').notNull().references(() => wishlists.id),
  productId: integer('product_id').notNull().references(() => products.id),
  variantId: integer('variant_id').references(() => productVariants.id),
  addedAt: text('added_at').default(sql`CURRENT_TIMESTAMP`),
  notes: text('notes'),
}, (table) => {
  return {
    // Um produto só pode aparecer uma vez em cada wishlist
    uniqueProductPerWishlist: unique().on(table.wishlistId, table.productId, table.variantId),
  };
});

// Relações para Itens de Wishlist
export const wishlistItemsRelations = relations(wishlistItems, ({ one }) => ({
  wishlist: one(wishlists, {
    fields: [wishlistItems.wishlistId],
    references: [wishlists.id],
  }),
  product: one(products, {
    fields: [wishlistItems.productId],
    references: [products.id],
  }),
  variant: one(productVariants, {
    fields: [wishlistItems.variantId],
    references: [productVariants.id],
  }),
}));

// Sistema de Notificações

// Tabela de Templates de Notificações
export const notificationTemplates = sqliteTable('notification_templates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'email', 'push', 'sms', 'in_app'
  subject: text('subject'), // Para emails
  content: text('content').notNull(),
  variables: text('variables'), // JSON com variáveis disponíveis
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Tabela de Configurações de Notificação por Usuário
export const userNotificationSettings = sqliteTable('user_notification_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id),
  notificationType: text('notification_type').notNull(), // 'order_updates', 'marketing', 'product_alerts', etc.
  channel: text('channel').notNull(), // 'email', 'push', 'sms', 'in_app'
  isEnabled: integer('is_enabled', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => {
  return {
    uniqueUserNotifType: unique().on(table.userId, table.notificationType, table.channel),
  };
});

// Relações para Configurações de Notificação
export const userNotificationSettingsRelations = relations(userNotificationSettings, ({ one }) => ({
  user: one(users, {
    fields: [userNotificationSettings.userId],
    references: [users.id],
  }),
}));

// Tabela de Notificações
export const notifications = sqliteTable('notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id),
  templateId: integer('template_id').references(() => notificationTemplates.id),
  type: text('type').notNull(), // 'order_updates', 'marketing', 'product_alerts', etc.
  channel: text('channel').notNull(), // 'email', 'push', 'sms', 'in_app'
  title: text('title').notNull(),
  content: text('content').notNull(),
  data: text('data'), // JSON com dados adicionais
  isRead: integer('is_read', { mode: 'boolean' }).default(false),
  readAt: text('read_at'),
  sentAt: text('sent_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para Notificações
export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
  template: one(notificationTemplates, {
    fields: [notifications.templateId],
    references: [notificationTemplates.id],
  }),
}));

// Sistema de Analytics

// Tabela de Eventos de Usuário
export const userEvents = sqliteTable('user_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').references(() => users.id),
  sessionId: text('session_id').notNull(),
  eventType: text('event_type').notNull(), // 'view_product', 'add_to_cart', 'search', etc.
  productId: integer('product_id').references(() => products.id),
  categoryId: integer('category_id').references(() => categories.id),
  searchQuery: text('search_query'),
  url: text('url'),
  referrer: text('referrer'),
  userAgent: text('user_agent'),
  ipAddress: text('ip_address'),
  additionalData: text('additional_data'), // JSON com dados específicos do evento
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para Eventos de Usuário
export const userEventsRelations = relations(userEvents, ({ one }) => ({
  user: one(users, {
    fields: [userEvents.userId],
    references: [users.id],
  }),
  product: one(products, {
    fields: [userEvents.productId],
    references: [products.id],
  }),
  category: one(categories, {
    fields: [userEvents.categoryId],
    references: [categories.id],
  }),
}));

// Tabela de Histórico de Preços
export const priceHistory = sqliteTable('price_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull().references(() => products.id),
  variantId: integer('variant_id').references(() => productVariants.id),
  oldPrice: real('old_price').notNull(),
  newPrice: real('new_price').notNull(),
  changedAt: text('changed_at').default(sql`CURRENT_TIMESTAMP`),
  changedBy: text('changed_by'), // ID do usuário ou 'system'
  reason: text('reason'),
});

// Relações para Histórico de Preços
export const priceHistoryRelations = relations(priceHistory, ({ one }) => ({
  product: one(products, {
    fields: [priceHistory.productId],
    references: [products.id],
  }),
  variant: one(productVariants, {
    fields: [priceHistory.variantId],
    references: [productVariants.id],
  }),
}));

// Sistema de Gestão de Disputas e Atendimento

// Tabela de Tickets de Suporte
export const supportTickets = sqliteTable('support_tickets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id),
  orderId: integer('order_id').references(() => orders.id),
  vendorId: integer('vendor_id').references(() => vendors.id),
  productId: integer('product_id').references(() => products.id),
  ticketNumber: text('ticket_number').notNull().unique(),
  subject: text('subject').notNull(),
  status: text('status').notNull().default('open'), // 'open', 'pending', 'resolved', 'closed'
  priority: text('priority').default('normal'), // 'low', 'normal', 'high', 'urgent'
  type: text('type').notNull(), // 'question', 'complaint', 'refund_request', etc.
  assignedTo: text('assigned_to'), // ID do usuário administrador ou atendente
  closedAt: text('closed_at'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para Tickets de Suporte
export const supportTicketsRelations = relations(supportTickets, ({ one, many }) => ({
  user: one(users, {
    fields: [supportTickets.userId],
    references: [users.id],
  }),
  order: one(orders, {
    fields: [supportTickets.orderId],
    references: [orders.id],
  }),
  vendor: one(vendors, {
    fields: [supportTickets.vendorId],
    references: [vendors.id],
  }),
  product: one(products, {
    fields: [supportTickets.productId],
    references: [products.id],
  }),
  messages: many(ticketMessages),
}));

// Tabela de Mensagens de Ticket
export const ticketMessages = sqliteTable('ticket_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ticketId: integer('ticket_id').notNull().references(() => supportTickets.id),
  senderId: text('sender_id').notNull(), // ID do usuário ou administrador
  senderType: text('sender_type').notNull(), // 'customer', 'vendor', 'admin'
  message: text('message').notNull(),
  attachments: text('attachments'), // JSON com URLs de anexos
  isInternal: integer('is_internal', { mode: 'boolean' }).default(false), // Notas internas não visíveis ao cliente
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para Mensagens de Ticket
export const ticketMessagesRelations = relations(ticketMessages, ({ one }) => ({
  ticket: one(supportTickets, {
    fields: [ticketMessages.ticketId],
    references: [supportTickets.id],
  }),
}));

// Tabela de Disputas
export const disputes = sqliteTable('disputes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderId: integer('order_id').notNull().references(() => orders.id),
  orderItemId: integer('order_item_id').references(() => orderItems.id),
  userId: text('user_id').notNull().references(() => users.id),
  vendorId: integer('vendor_id').notNull().references(() => vendors.id),
  status: text('status').notNull().default('open'), // 'open', 'mediation', 'resolved_buyer', 'resolved_vendor', 'closed'
  type: text('type').notNull(), // 'refund', 'return', 'exchange', 'not_received', 'damaged'
  reason: text('reason').notNull(),
  requestedAmount: real('requested_amount'),
  approvedAmount: real('approved_amount'),
  resolution: text('resolution'),
  resolvedAt: text('resolved_at'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para Disputas
export const disputesRelations = relations(disputes, ({ one, many }) => ({
  order: one(orders, {
    fields: [disputes.orderId],
    references: [orders.id],
  }),
  orderItem: one(orderItems, {
    fields: [disputes.orderItemId],
    references: [orderItems.id],
  }),
  user: one(users, {
    fields: [disputes.userId],
    references: [users.id],
  }),
  vendor: one(vendors, {
    fields: [disputes.vendorId],
    references: [vendors.id],
  }),
  messages: many(disputeMessages),
}));

// Tabela de Mensagens de Disputa
export const disputeMessages = sqliteTable('dispute_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  disputeId: integer('dispute_id').notNull().references(() => disputes.id),
  senderId: text('sender_id').notNull(), // ID do usuário, vendedor ou administrador
  senderType: text('sender_type').notNull(), // 'customer', 'vendor', 'admin'
  message: text('message').notNull(),
  attachments: text('attachments'), // JSON com URLs de anexos (fotos, comprovantes)
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para Mensagens de Disputa
export const disputeMessagesRelations = relations(disputeMessages, ({ one }) => ({
  dispute: one(disputes, {
    fields: [disputeMessages.disputeId],
    references: [disputes.id],
  }),
}));

// Sistema de Gestão Avançada de Estoque

// Tabela de Alertas de Estoque
export const stockAlerts = sqliteTable('stock_alerts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull().references(() => products.id),
  variantId: integer('variant_id').references(() => productVariants.id),
  alertType: text('alert_type').notNull(), // 'low_stock', 'out_of_stock', 'critical'
  threshold: integer('threshold').notNull(),
  currentStock: integer('current_stock').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  notifiedAt: text('notified_at'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para Alertas de Estoque
export const stockAlertsRelations = relations(stockAlerts, ({ one }) => ({
  product: one(products, {
    fields: [stockAlerts.productId],
    references: [products.id],
  }),
  variant: one(productVariants, {
    fields: [stockAlerts.variantId],
    references: [productVariants.id],
  }),
}));

// Tabela de Reserva de Estoque
export const stockReservations = sqliteTable('stock_reservations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull().references(() => products.id),
  variantId: integer('variant_id').references(() => productVariants.id),
  quantity: integer('quantity').notNull(),
  orderId: integer('order_id').references(() => orders.id),
  cartId: integer('cart_id').references(() => carts.id),
  userId: text('user_id').references(() => users.id),
  sessionId: text('session_id'),
  expiresAt: text('expires_at'), // Para reservas temporárias (carrinhos)
  status: text('status').notNull(), // 'pending', 'confirmed', 'cancelled', 'expired'
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => {
  return {
    // Garante que uma reserva está associada a um carrinho OU a um pedido
    // Mas não aos dois ao mesmo tempo
    stockReservationCheck: sql`(
      (${table.orderId} IS NOT NULL AND ${table.cartId} IS NULL) OR
      (${table.orderId} IS NULL AND ${table.cartId} IS NOT NULL)
    )`,
  };
});

// Relações para Reserva de Estoque
export const stockReservationsRelations = relations(stockReservations, ({ one }) => ({
  product: one(products, {
    fields: [stockReservations.productId],
    references: [products.id],
  }),
  variant: one(productVariants, {
    fields: [stockReservations.variantId],
    references: [productVariants.id],
  }),
  order: one(orders, {
    fields: [stockReservations.orderId],
    references: [orders.id],
  }),
  cart: one(carts, {
    fields: [stockReservations.cartId],
    references: [carts.id],
  }),
  user: one(users, {
    fields: [stockReservations.userId],
    references: [users.id],
  }),
}));

// Tabela de Histórico de Ajustes de Estoque
export const stockHistory = sqliteTable('stock_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull().references(() => products.id),
  variantId: integer('variant_id').references(() => productVariants.id),
  previousStock: integer('previous_stock').notNull(),
  newStock: integer('new_stock').notNull(),
  adjustment: integer('adjustment').notNull(), // Quantidade ajustada (positiva ou negativa)
  reason: text('reason').notNull(), // 'purchase', 'sale', 'return', 'inventory_count', 'damage', etc.
  reference: text('reference'), // Referência para pedido, compra, etc.
  notes: text('notes'),
  adjustedBy: text('adjusted_by').notNull(), // ID do usuário ou 'system'
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para Histórico de Ajustes de Estoque
export const stockHistoryRelations = relations(stockHistory, ({ one }) => ({
  product: one(products, {
    fields: [stockHistory.productId],
    references: [products.id],
  }),
  variant: one(productVariants, {
    fields: [stockHistory.variantId],
    references: [productVariants.id],
  }),
}));

// ============== Otimização para Alta Demanda ==============

// Tabela de Cache para produtos frequentemente acessados
export const productCache = sqliteTable('product_cache', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull().references(() => products.id).unique(),
  cachedData: text('cached_data').notNull(), // JSON com dados do produto
  viewCount: integer('view_count').default(0),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  expiresAt: text('expires_at').notNull(),
});

// Relações para Cache de Produtos
export const productCacheRelations = relations(productCache, ({ one }) => ({
  product: one(products, {
    fields: [productCache.productId],
    references: [products.id],
  }),
}));

// Tabela de Estatísticas de Busca
export const searchStats = sqliteTable('search_stats', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  searchTerm: text('search_term').notNull(),
  count: integer('count').default(0),
  lastSearchedAt: text('last_searched_at').default(sql`CURRENT_TIMESTAMP`),
  averageResultsCount: integer('average_results_count').default(0),
  hasResults: integer('has_results', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// Tabela de Indexação de Produtos para busca rápida
export const productSearchIndex = sqliteTable('product_search_index', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull().references(() => products.id).unique(),
  searchableText: text('searchable_text').notNull(), // Texto pré-processado para busca
  keywords: text('keywords'), // Palavras-chave adicionais
  boost: real('boost').default(1.0), // Fator de relevância
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relações para Indexação de Produtos
export const productSearchIndexRelations = relations(productSearchIndex, ({ one }) => ({
  product: one(products, {
    fields: [productSearchIndex.productId],
    references: [products.id],
  }),
}));

// Tabela de Métricas de Performance
export const performanceMetrics = sqliteTable('performance_metrics', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  metricType: text('metric_type').notNull(), // 'page_load', 'api_response', 'search', 'checkout'
  route: text('route'), // Rota ou endpoint
  responseTime: integer('response_time'), // Em milissegundos
  userCount: integer('user_count'), // Usuários simultâneos
  errorRate: real('error_rate').default(0),
  timestamp: text('timestamp').default(sql`CURRENT_TIMESTAMP`),
});