const Database = require('better-sqlite3');

// Criar conexão com o banco de dados SQLite
const db = new Database("./marketplace.db");

/**
 * Script para popular o banco de dados com dados iniciais
 */
async function seedInitialData() {
  try {
    console.log("Iniciando seed de dados iniciais...");
    
    // Limpar dados existentes (para evitar duplicação)
    db.exec('DELETE FROM category_identifiers');
    db.exec('DELETE FROM categories');
    
    // Resetar contadores de autoincremento
    db.exec('DELETE FROM sqlite_sequence WHERE name = \'categories\'');
    db.exec('DELETE FROM sqlite_sequence WHERE name = \'category_identifiers\'');
    
    console.log("Tabelas limpas, iniciando inserção de dados...");

    // Inserir categorias principais
    const mainCategories = [
      { name: 'Quarto', description: 'Móveis e decoração para quarto de bebê e criança' },
      { name: 'Berços e Camas', description: 'Berços, minicamas e camas infantis' },
      { name: 'Enxoval', description: 'Roupas de cama, banho e itens de enxoval' },
      { name: 'Brinquedos', description: 'Brinquedos educativos e recreativos' },
      { name: 'Alimentação', description: 'Itens para alimentação de bebês e crianças' },
      { name: 'Higiene e Saúde', description: 'Produtos para cuidados e higiene' },
      { name: 'Passeio', description: 'Carrinhos, cadeiras para auto e acessórios' },
      { name: 'Roupas', description: 'Roupas para bebês e crianças' }
    ];
    
    const insertCategory = db.prepare(`
      INSERT INTO categories (name, description, parent_id, is_active, display_order)
      VALUES (?, ?, ?, 1, ?)
    `);
    
    const insertCID = db.prepare(`
      INSERT INTO category_identifiers (category_id, cid, is_default, language)
      VALUES (?, ?, 1, 'pt-BR')
    `);

    mainCategories.forEach((category, index) => {
      const result = insertCategory.run(
        category.name,
        category.description,
        null, // parent_id
        index
      );
      
      const categoryId = result.lastInsertRowid;
      const slug = category.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, '-');
      
      insertCID.run(categoryId, slug);
      
      console.log(`Categoria principal inserida: ${category.name} (ID: ${categoryId}, CID: ${slug})`);
    });
    
    // Inserir subcategorias
    const subcategories = [
      // Subcategorias de Quarto
      { name: 'Cômodas', description: 'Cômodas e trocadores para quarto de bebê', parentName: 'Quarto' },
      { name: 'Guarda-Roupas', description: 'Guarda-roupas infantis', parentName: 'Quarto' },
      { name: 'Decoração', description: 'Itens decorativos para quarto infantil', parentName: 'Quarto' },
      { name: 'Acessórios', description: 'Acessórios para quarto de bebê', parentName: 'Quarto' },
      
      // Subcategorias de Berços e Camas
      { name: 'Berços', description: 'Berços tradicionais', parentName: 'Berços e Camas' },
      { name: 'Minicamas', description: 'Minicamas para a transição do berço', parentName: 'Berços e Camas' },
      { name: 'Camas infantis', description: 'Camas para crianças', parentName: 'Berços e Camas' },
      { name: 'Acessórios para berço', description: 'Acessórios e utilidades para berços', parentName: 'Berços e Camas' },
      
      // Subcategorias de Enxoval
      { name: 'Lençóis', description: 'Lençóis para berço e cama infantil', parentName: 'Enxoval' },
      { name: 'Edredons', description: 'Edredons e mantas para berço e cama', parentName: 'Enxoval' },
      { name: 'Toalhas', description: 'Toalhas de banho e fralda', parentName: 'Enxoval' },
      { name: 'Travesseiros', description: 'Travesseiros infantis', parentName: 'Enxoval' },
      
      // Subcategorias de Brinquedos
      { name: 'Brinquedos Educativos', description: 'Brinquedos para estimulação e aprendizado', parentName: 'Brinquedos' },
      { name: 'Pelúcias', description: 'Pelúcias e bonecos', parentName: 'Brinquedos' },
      { name: 'Brinquedos para Bebês', description: 'Brinquedos específicos para bebês', parentName: 'Brinquedos' },
      { name: 'Jogos e Quebra-cabeças', description: 'Jogos infantis e quebra-cabeças', parentName: 'Brinquedos' }
    ];
    
    // Buscar IDs das categorias principais para associar as subcategorias
    const getParentId = db.prepare('SELECT id FROM categories WHERE name = ?');
    
    subcategories.forEach((subcat, index) => {
      const parentRow = getParentId.get(subcat.parentName);
      
      if (parentRow) {
        const result = insertCategory.run(
          subcat.name,
          subcat.description,
          parentRow.id,
          index
        );
        
        const subcatId = result.lastInsertRowid;
        
        // Criar slug baseado no nome pai + subcategoria
        const parentSlug = subcat.parentName
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^\w\s]/g, '')
          .replace(/\s+/g, '-');
          
        const subcatSlug = subcat.name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^\w\s]/g, '')
          .replace(/\s+/g, '-');
          
        const fullSlug = `${parentSlug}/${subcatSlug}`;
        
        insertCID.run(subcatId, fullSlug);
        
        console.log(`Subcategoria inserida: ${subcat.name} (ID: ${subcatId}, CID: ${fullSlug})`);
      } else {
        console.error(`Categoria pai não encontrada: ${subcat.parentName}`);
      }
    });
    
    // Inserir status de pedido padrão
    try {
      // Verificar se a tabela existe
      const tableExists = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='order_statuses'
      `).get();
      
      if (tableExists) {
        // Limpar dados existentes
        db.exec('DELETE FROM order_statuses');
        db.exec('DELETE FROM sqlite_sequence WHERE name = "order_statuses"');
        
        // Inserir status de pedido padrão
        const orderStatuses = [
          { name: 'pending', displayName: 'Aguardando Pagamento', color: '#FFC107', isDefault: 1, isFinal: 0 },
          { name: 'paid', displayName: 'Pagamento Confirmado', color: '#2196F3', isDefault: 0, isFinal: 0 },
          { name: 'preparing', displayName: 'Em Preparação', color: '#9C27B0', isDefault: 0, isFinal: 0 },
          { name: 'shipped', displayName: 'Enviado', color: '#00BCD4', isDefault: 0, isFinal: 0 },
          { name: 'delivered', displayName: 'Entregue', color: '#4CAF50', isDefault: 0, isFinal: 1 },
          { name: 'canceled', displayName: 'Cancelado', color: '#F44336', isDefault: 0, isFinal: 1 },
          { name: 'returned', displayName: 'Devolvido', color: '#FF5722', isDefault: 0, isFinal: 1 }
        ];
        
        const insertOrderStatus = db.prepare(`
          INSERT INTO order_statuses (name, display_name, color, is_default, is_final, display_order)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        orderStatuses.forEach((status, index) => {
          insertOrderStatus.run(
            status.name,
            status.displayName,
            status.color,
            status.isDefault,
            status.isFinal,
            index
          );
          
          console.log(`Status de pedido inserido: ${status.displayName}`);
        });
      } else {
        console.log('Tabela order_statuses não existe. Pulando inserção de status de pedido.');
      }
    } catch (error) {
      console.error('Erro ao inserir status de pedido:', error);
    }
    
    console.log("Seed de dados iniciais concluído com sucesso!");
  } catch (error) {
    console.error("Erro durante o processo de seed:", error);
    process.exit(1);
  }
}

// Executar seed
seedInitialData().then(() => {
  db.close();
  console.log("Processo de seed finalizado!");
  process.exit(0);
});