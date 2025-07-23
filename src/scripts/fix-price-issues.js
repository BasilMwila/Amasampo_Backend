/* eslint-disable linebreak-style */
/* eslint-disable max-len */
/* eslint-disable linebreak-style */
/* eslint-disable no-undef */
/* eslint-disable indent */
/* eslint-disable no-labels */
/* eslint-disable no-unused-labels */
/* eslint-disable linebreak-style */
/* eslint-disable no-unused-expressions */
/* eslint-disable linebreak-style */
/* eslint-disable padded-blocks */
/* eslint-disable linebreak-style */
/* eslint-disable eqeqeq */
/* eslint-disable linebreak-style */
/* eslint-disable arrow-parens */
/* eslint-disable linebreak-style */
/* eslint-disable newline-per-chained-call */
/* eslint-disable import/order */
/* eslint-disable linebreak-style */
/* eslint-disable no-plusplus */
/* eslint-disable linebreak-style */
/* eslint-disable radix */
/* eslint-disable linebreak-style */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
/* eslint-disable linebreak-style */
/* eslint-disable no-unused-vars */
/* eslint-disable linebreak-style */
/* eslint-disable object-curly-newline */
/* eslint-disable camelcase */
/* eslint-disable no-trailing-spaces */
/* eslint-disable import/newline-after-import */
/* eslint-disable linebreak-style */
/* eslint-disable quotes */
/* eslint-disable linebreak-style */
/* eslint-disable no-return-await */
/* eslint-disable linebreak-style */
/* eslint-disable eol-last */
/* eslint-disable operator-linebreak */
/* eslint-disable comma-dangle */
/* eslint-disable arrow-body-style */
/* eslint-disable linebreak-style */
// scripts/fix-price-issues.js - Complete fix for price conversion issues
const path = require('path');
const fs = require('fs');

// Helper function to convert price fields from strings to numbers
const convertPriceFields = (product) => {
  if (!product) return product;
  
  const priceFields = ['price', 'original_price'];
  const converted = { ...product };
  
  priceFields.forEach(field => {
    if (converted[field] !== null && converted[field] !== undefined) {
      converted[field] = parseFloat(converted[field]);
    }
  });
  
  return converted;
};

// Helper function to convert array of products
const convertProductPrices = (products) => {
  if (!Array.isArray(products)) return products;
  return products.map(convertPriceFields);
};

console.log('🔧 Fixing price conversion issues...');

// 1. Add helper functions to database.js
const dbPath = path.join(__dirname, '..', 'src', 'config', 'database.js');
let dbContent = fs.readFileSync(dbPath, 'utf8');

// Check if helper functions already exist
if (!dbContent.includes('convertPriceFields')) {
  console.log('📝 Adding price conversion helper functions...');
  
  const helperFunctions = `
// Helper function to convert price fields from strings to numbers
const convertPriceFields = (product) => {
  if (!product) return product;
  
  const priceFields = ['price', 'original_price'];
  const converted = { ...product };
  
  priceFields.forEach(field => {
    if (converted[field] !== null && converted[field] !== undefined) {
      converted[field] = parseFloat(converted[field]);
    }
  });
  
  return converted;
};

// Helper function to convert array of products
const convertProductPrices = (products) => {
  if (!Array.isArray(products)) return products;
  return products.map(convertPriceFields);
};

`;

  // Add helper functions after the imports but before the pool definition
  const poolIndex = dbContent.indexOf('const pool = new Pool');
  if (poolIndex !== -1) {
    dbContent = dbContent.slice(0, poolIndex) + helperFunctions + dbContent.slice(poolIndex);
  }
}

// 2. Update createProduct function
if (dbContent.includes('createProduct: async (productData) => {')) {
  console.log('🔧 Updating createProduct function...');
  
  const createProductRegex = /createProduct: async \(productData\) => \{[\s\S]*?return result\.rows\[0\];\s*\},/;
  const newCreateProduct = `createProduct: async (productData) => {
     const { 
    seller_id, 
    category_id, 
    name, 
    description, 
    price, 
    quantity, 
    image_url, 
    images, 
    is_featured = false, 
    is_on_sale = false, 
    original_price 
  } = productData;
  
  const result = await query(
    \`INSERT INTO products (
      seller_id, category_id, name, description, price, quantity, 
      image_url, images, is_featured, is_on_sale, original_price, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true) 
    RETURNING *\`,
    [
      seller_id, category_id, name, description, price, quantity,
      image_url, images ? JSON.stringify(images) : null, 
      is_featured, is_on_sale, original_price
    ]
  );
  
  // Convert price fields to numbers before returning
  return convertPriceFields(result.rows[0]);
},`;

  dbContent = dbContent.replace(createProductRegex, newCreateProduct);
}

// 3. Update getProductById function
if (dbContent.includes('getProductById: async (id) => {')) {
  console.log('🔧 Updating getProductById function...');
  
  const getProductRegex = /getProductById: async \(id\) => \{[\s\S]*?return result\.rows\[0\];\s*\},/;
  const newGetProduct = `getProductById: async (id) => {
  const result = await query(
    \`SELECT p.*, c.name as category_name, u.name as seller_name, u.shop_name
     FROM products p
     LEFT JOIN categories c ON p.category_id = c.id
     LEFT JOIN users u ON p.seller_id = u.id
     WHERE p.id = $1\`,
    [id]
  );
  
  // Convert price fields to numbers before returning
  return convertPriceFields(result.rows[0]);
},`;

  dbContent = dbContent.replace(getProductRegex, newGetProduct);
}

// 4. Update updateProduct function
if (dbContent.includes('updateProduct: async (id, productData) => {')) {
  console.log('🔧 Updating updateProduct function...');
  
  const updateProductRegex = /updateProduct: async \(id, productData\) => \{[\s\S]*?return result\.rows\[0\];\s*\},/;
  const newUpdateProduct = `updateProduct: async (id, productData) => {
  const fields = [];
  const values = [];
  let paramCount = 1;

  Object.entries(productData).forEach(([key, value]) => {
    if (value !== undefined) {
      fields.push(\`\${key} = $\${paramCount}\`);
      values.push(key === 'images' && typeof value === 'object' ? JSON.stringify(value) : value);
      paramCount++;
    }
  });

  if (fields.length === 0) return null;

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  const result = await query(
    \`UPDATE products SET \${fields.join(', ')} 
     WHERE id = $\${paramCount} AND is_active = true 
     RETURNING *\`,
    values
  );
  
  // Convert price fields to numbers before returning
  return convertPriceFields(result.rows[0]);
},`;

  dbContent = dbContent.replace(updateProductRegex, newUpdateProduct);
}

// 5. Update module.exports to include helper functions
if (!dbContent.includes('convertPriceFields,')) {
  console.log('📝 Adding helper functions to exports...');
  
  const exportsRegex = /module\.exports = \{[\s\S]*?\};/;
  const currentExports = dbContent.match(exportsRegex)[0];
  const newExports = currentExports.replace(
    'dbQueries',
    'dbQueries,\n  convertPriceFields,\n  convertProductPrices'
  );
  
  dbContent = dbContent.replace(exportsRegex, newExports);
}

// Write updated database.js
fs.writeFileSync(dbPath, dbContent);
console.log('✅ Updated database.js with price conversion fixes');

// 6. Create updated product routes file
const routesPath = path.join(__dirname, '..', 'src', 'routes', 'product.js');
let routesContent = fs.readFileSync(routesPath, 'utf8');

// Check if we need to add the convertProductPrices import
if (!routesContent.includes('convertProductPrices')) {
  console.log('📝 Updating product routes...');
  
  // Update the require statement
  routesContent = routesContent.replace(
    "const { dbQueries } = require('../config/database');",
    "const { dbQueries, convertPriceFields, convertProductPrices } = require('../config/database');"
  );

  // Add the helper function for query results
  const helperFunction = `
// Helper function to convert prices in query results
const convertProductQueryPrices = (products) => {
  if (!Array.isArray(products)) return products;
  return products.map(product => {
    const converted = { ...product };
    // Convert price fields
    if (converted.price !== null && converted.price !== undefined) {
      converted.price = parseFloat(converted.price);
    }
    if (converted.original_price !== null && converted.original_price !== undefined) {
      converted.original_price = parseFloat(converted.original_price);
    }
    return converted;
  });
};
`;

  // Add helper function after imports
  const importEndIndex = routesContent.indexOf("const { productSchemas, validate, validateQuery } = require('../validation/schemas');");
  if (importEndIndex !== -1) {
    const insertPoint = routesContent.indexOf('\n', importEndIndex) + 1;
    routesContent = routesContent.slice(0, insertPoint) + helperFunction + routesContent.slice(insertPoint);
  }

  // Update all route handlers to use convertProductQueryPrices
  routesContent = routesContent.replace(
    /products: result\.rows/g,
    'products: convertProductQueryPrices(result.rows)'
  );

  fs.writeFileSync(routesPath, routesContent);
  console.log('✅ Updated product routes with price conversion');
}

console.log('\n🎉 Price conversion fixes applied successfully!');
console.log('\n📋 Summary of changes:');
console.log('  ✅ Added convertPriceFields helper function');
console.log('  ✅ Added convertProductPrices helper function');
console.log('  ✅ Updated createProduct to convert prices');
console.log('  ✅ Updated getProductById to convert prices');
console.log('  ✅ Updated updateProduct to convert prices');
console.log('  ✅ Updated product routes to convert query results');
console.log('\n🚀 Restart your server to apply the changes!');

module.exports = {
  convertPriceFields,
  convertProductPrices
};