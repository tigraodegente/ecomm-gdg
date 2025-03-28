/**
 * Script para atualizar o índice de busca
 * 
 * Este script gera um índice de busca com dados de produtos de exemplo
 * e o salva em um arquivo JSON para ser usado pelo FlexSearch.
 */

const fs = require('fs');
const path = require('path');

console.log('Gerando índice de busca com produtos de exemplo...');

// Dados de exemplo para o índice
const sampleProducts = [
  {
    id: '1',
    name: 'Berço Montessoriano',
    description: 'Berço montessoriano em madeira natural',
    short_description: 'Berço montessoriano em madeira natural',
    price: 899.90,
    compare_at_price: 999.90,
    mainImage: 'https://via.placeholder.com/150',
    slug: 'berco-montessoriano',
    vendor_name: 'Móveis Infantis Ltda',
    category_name: 'Berços',
    searchData: 'Berço Montessoriano madeira natural quarto bebê montessori'
  },
  {
    id: '2',
    name: 'Kit Enxoval Completo',
    description: 'Kit enxoval com 20 peças para bebê',
    short_description: 'Kit enxoval com 20 peças para bebê',
    price: 349.90,
    compare_at_price: 399.90,
    mainImage: 'https://via.placeholder.com/150',
    slug: 'kit-enxoval-completo',
    vendor_name: 'Baby Shop',
    category_name: 'Enxoval',
    searchData: 'Kit Enxoval Completo bebê roupa lençol fronha travesseiro'
  },
  {
    id: '3',
    name: 'Mobile Musical Girafa',
    description: 'Mobile musical de girafas para berço',
    short_description: 'Mobile musical de girafas para berço',
    price: 129.90,
    compare_at_price: 149.90,
    mainImage: 'https://via.placeholder.com/150',
    slug: 'mobile-musical-girafa',
    vendor_name: 'Baby Dreams',
    category_name: 'Decoração',
    searchData: 'Mobile musical girafa berço bebê decoração quarto infantil'
  },
  {
    id: '4',
    name: 'Vestido Batizado',
    description: 'Vestido para batizado em tecido 100% algodão',
    short_description: 'Vestido para batizado em tecido 100% algodão',
    price: 159.90,
    compare_at_price: null,
    mainImage: 'https://via.placeholder.com/150',
    slug: 'vestido-batizado',
    vendor_name: 'Baby Vestidos',
    category_name: 'Roupas',
    searchData: 'Vestido batizado branco algodão menina'
  },
  {
    id: '5',
    name: 'Carrinho de Bebê 3 em 1',
    description: 'Carrinho convertível em bebê conforto e moisés',
    short_description: 'Carrinho convertível em bebê conforto e moisés',
    price: 1899.90,
    compare_at_price: 2299.90,
    mainImage: 'https://via.placeholder.com/150',
    slug: 'carrinho-bebe-3-em-1',
    vendor_name: 'Grão de Gente',
    category_name: 'Carrinhos',
    searchData: 'Carrinho bebê conforto moisés passeio'
  },
  {
    id: '6',
    name: 'Tapete Infantil Alfabeto',
    description: 'Tapete infantil com alfabeto e números',
    short_description: 'Tapete infantil com alfabeto e números',
    price: 129.90,
    compare_at_price: 149.90,
    mainImage: 'https://via.placeholder.com/150',
    slug: 'tapete-infantil-alfabeto',
    vendor_name: 'Decor Kids',
    category_name: 'Tapetes',
    searchData: 'Tapete infantil alfabeto educativo números colorido'
  },
  {
    id: '7',
    name: 'Kit Higiene Bebê',
    description: 'Kit de higiene para bebê com 5 peças',
    short_description: 'Kit de higiene para bebê com 5 peças',
    price: 89.90,
    compare_at_price: 99.90,
    mainImage: 'https://via.placeholder.com/150',
    slug: 'kit-higiene-bebe',
    vendor_name: 'Baby Care',
    category_name: 'Higiene',
    searchData: 'Kit higiene bebê pente escova saboneteira'
  },
  {
    id: '8',
    name: 'Cadeira de Alimentação',
    description: 'Cadeira de alimentação reclinável e ajustável',
    short_description: 'Cadeira de alimentação reclinável e ajustável',
    price: 379.90,
    compare_at_price: 429.90,
    mainImage: 'https://via.placeholder.com/150',
    slug: 'cadeira-alimentacao',
    vendor_name: 'Grão de Gente',
    category_name: 'Alimentação',
    searchData: 'Cadeira alimentação bebê refeição ajustável'
  },
  {
    id: '9',
    name: 'Kit Berço 9 Peças',
    description: 'Kit berço completo com 9 peças tema safari',
    short_description: 'Kit berço completo com 9 peças tema safari',
    price: 299.90,
    compare_at_price: 349.90,
    mainImage: 'https://via.placeholder.com/150',
    slug: 'kit-berco-9-pecas',
    vendor_name: 'Grão de Gente',
    category_name: 'Enxoval',
    searchData: 'Kit berço enxoval safari protetor lençol fronha edredom'
  },
  {
    id: '10',
    name: 'Andador Musical',
    description: 'Andador com painel musical e brinquedos',
    short_description: 'Andador com painel musical e brinquedos',
    price: 219.90,
    compare_at_price: 249.90,
    mainImage: 'https://via.placeholder.com/150',
    slug: 'andador-musical',
    vendor_name: 'Baby Adventures',
    category_name: 'Brinquedos',
    searchData: 'Andador musical bebê brinquedos interativo'
  },
  {
    id: '11',
    name: 'Carrinho de Bebê Voyage',
    description: 'Carrinho de bebê leve e dobrável',
    short_description: 'Carrinho de bebê leve e dobrável',
    price: 699.90,
    compare_at_price: 799.90,
    mainImage: 'https://via.placeholder.com/150',
    slug: 'carrinho-bebe-voyage',
    vendor_name: 'Baby Travel',
    category_name: 'Carrinhos',
    searchData: 'Carrinho bebê viagem dobrável leve compacto'
  },
  {
    id: '12',
    name: 'Kit 3 Bodys Manga Longa',
    description: 'Kit com 3 bodys de manga longa para bebê',
    short_description: 'Kit com 3 bodys de manga longa para bebê',
    price: 89.90,
    compare_at_price: 109.90,
    mainImage: 'https://via.placeholder.com/150',
    slug: 'kit-3-bodys-manga-longa',
    vendor_name: 'Baby Fashion',
    category_name: 'Roupas',
    searchData: 'Kit bodys manga longa bebê roupa algodão'
  },
  {
    id: '13',
    name: 'Berço Portátil Dobrável',
    description: 'Berço portátil e dobrável para viagens',
    short_description: 'Berço portátil e dobrável para viagens',
    price: 459.90,
    compare_at_price: 559.90,
    mainImage: 'https://via.placeholder.com/150',
    slug: 'berco-portatil-dobravel',
    vendor_name: 'Baby Travel',
    category_name: 'Berços',
    searchData: 'Berço portátil dobrável viagem compacto'
  },
  {
    id: '14', 
    name: 'Vestido de Verão para Bebê',
    description: 'Vestido fresco para os dias de verão',
    short_description: 'Vestido fresco para os dias de verão',
    price: 79.90,
    compare_at_price: 99.90,
    mainImage: 'https://via.placeholder.com/150',
    slug: 'vestido-verao-bebe',
    vendor_name: 'Baby Fashion',
    category_name: 'Roupas',
    searchData: 'Vestido verão bebê menina fresco leve algodão'
  },
  {
    id: '15',
    name: 'Chupeta Ortodôntica Kit com 2',
    description: 'Kit com 2 chupetas ortodônticas de silicone',
    short_description: 'Kit com 2 chupetas ortodônticas de silicone',
    price: 39.90,
    compare_at_price: 49.90,
    mainImage: 'https://via.placeholder.com/150',
    slug: 'chupeta-ortodontica-kit-2',
    vendor_name: 'Baby Care',
    category_name: 'Higiene',
    searchData: 'Chupeta ortodôntica kit silicone bebê'
  }
];

// Formatar para o formato esperado pelo sistema de busca
const formattedProducts = sampleProducts.map(product => ({
  id: product.id,
  name: product.name,
  description: product.short_description || product.description,
  price: product.price,
  comparePrice: product.compare_at_price,
  image: product.mainImage || 'https://via.placeholder.com/150',
  slug: product.slug,
  vendorName: product.vendor_name,
  category: product.category_name,
  searchData: product.searchData
}));

// Criar estrutura do índice
const searchIndex = {
  success: true,
  products: formattedProducts,
  timestamp: Date.now()
};

// Criar diretório se não existir
const dataDir = path.join(__dirname, '..', 'public', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Salvar o índice em um arquivo JSON
const indexPath = path.join(dataDir, 'search-index.json');
fs.writeFileSync(indexPath, JSON.stringify(searchIndex, null, 2));

console.log(`Índice de busca atualizado com ${formattedProducts.length} produtos de exemplo`);
console.log(`Arquivo salvo em: ${indexPath}`);