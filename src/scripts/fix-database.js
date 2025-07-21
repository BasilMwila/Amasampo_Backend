/* eslint-disable linebreak-style */
/* eslint-disable prefer-template */
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
// scripts/fix-database.js - Script to fix missing columns and ensure proper schema
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'ls-cf31de6d33ef5ebb28072f9a30dc750a55411921.c0vyackkg5lk.us-east-1.rds.amazonaws.com',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'dbmasteruser',
  password: process.env.DB_PASSWORD || 'm53%a8fvp~s^~3Bxq}Qipw8kA]*J9h6_',
  ssl: {
    rejectUnauthorized: false,
    require: true
  }
});

// Generic query function
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text: text.substring(0, 50) + '...', duration, rows: result.rowCount });
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

// Transaction helper
const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Function to check if a column exists in a table
async function columnExists(client, tableName, columnName) {
  try {
    const result = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1 AND column_name = $2
    `, [tableName, columnName]);
    
    return result.rows.length > 0;
  } catch (error) {
    console.error(`Error checking if column ${columnName} exists in ${tableName}:`, error);
    return false;
  }
}

// Function to check if a table exists
async function tableExists(client, tableName) {
  try {
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = $1 AND table_schema = 'public'
    `, [tableName]);
    
    return result.rows.length > 0;
  } catch (error) {
    console.error(`Error checking if table ${tableName} exists:`, error);
    return false;
  }
}

// Function to check if an index exists
async function indexExists(client, indexName) {
  try {
    const result = await client.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE indexname = $1
    `, [indexName]);
    
    return result.rows.length > 0;
  } catch (error) {
    console.error(`Error checking if index ${indexName} exists:`, error);
    return false;
  }
}

// Function to add missing parent_id column to categories table
async function fixCategoriesTable(client) {
  console.log('🔍 Checking categories table...');
  
  const hasTable = await tableExists(client, 'categories');
  if (!hasTable) {
    console.log('📋 Creating categories table...');
    await client.query(`
      CREATE TABLE categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        icon VARCHAR(100),
        parent_id INTEGER REFERENCES categories(id),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Categories table created');
  } else {
    // Check for missing columns
    const hasParentId = await columnExists(client, 'categories', 'parent_id');
    if (!hasParentId) {
      console.log('🔧 Adding missing parent_id column to categories table...');
      await client.query(`
        ALTER TABLE categories 
        ADD COLUMN parent_id INTEGER REFERENCES categories(id)
      `);
      console.log('✅ parent_id column added');
    }

    const hasIsActive = await columnExists(client, 'categories', 'is_active');
    if (!hasIsActive) {
      console.log('🔧 Adding missing is_active column to categories table...');
      await client.query(`
        ALTER TABLE categories 
        ADD COLUMN is_active BOOLEAN DEFAULT true
      `);
      console.log('✅ is_active column added');
    }

    const hasCreatedAt = await columnExists(client, 'categories', 'created_at');
    if (!hasCreatedAt) {
      console.log('🔧 Adding missing created_at column to categories table...');
      await client.query(`
        ALTER TABLE categories 
        ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      `);
      console.log('✅ created_at column added');
    }

    const hasUpdatedAt = await columnExists(client, 'categories', 'updated_at');
    if (!hasUpdatedAt) {
      console.log('🔧 Adding missing updated_at column to categories table...');
      await client.query(`
        ALTER TABLE categories 
        ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      `);
      console.log('✅ updated_at column added');
    }
  }

  // Add indexes
  const hasParentIdIndex = await indexExists(client, 'idx_categories_parent_id');
  if (!hasParentIdIndex) {
    console.log('🔧 Creating parent_id index...');
    await client.query(`
      CREATE INDEX idx_categories_parent_id ON categories(parent_id)
    `);
    console.log('✅ parent_id index created');
  }

  const hasIsActiveIndex = await indexExists(client, 'idx_categories_is_active');
  if (!hasIsActiveIndex) {
    console.log('🔧 Creating is_active index...');
    await client.query(`
      CREATE INDEX idx_categories_is_active ON categories(is_active)
    `);
    console.log('✅ is_active index created');
  }
}

// Function to fix other common table issues
async function fixCommonIssues(client) {
  console.log('🔍 Checking for other common issues...');

  // Check if users table has all required columns
  const hasUsersTable = await tableExists(client, 'users');
  if (hasUsersTable) {
    const hasUserType = await columnExists(client, 'users', 'user_type');
    if (!hasUserType) {
      console.log('🔧 Adding missing user_type column to users table...');
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN user_type VARCHAR(20) NOT NULL DEFAULT 'buyer' 
        CHECK (user_type IN ('buyer', 'seller'))
      `);
      console.log('✅ user_type column added');
    }

    const hasShopName = await columnExists(client, 'users', 'shop_name');
    if (!hasShopName) {
      console.log('🔧 Adding missing shop_name column to users table...');
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN shop_name VARCHAR(255)
      `);
      console.log('✅ shop_name column added');
    }

    const hasIsActive = await columnExists(client, 'users', 'is_active');
    if (!hasIsActive) {
      console.log('🔧 Adding missing is_active column to users table...');
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN is_active BOOLEAN DEFAULT true
      `);
      console.log('✅ is_active column added');
    }
  }

  // Check if products table has proper category reference
  const hasProductsTable = await tableExists(client, 'products');
  if (hasProductsTable) {
    const hasCategoryId = await columnExists(client, 'products', 'category_id');
    if (!hasCategoryId) {
      console.log('🔧 Adding missing category_id column to products table...');
      await client.query(`
        ALTER TABLE products 
        ADD COLUMN category_id INTEGER REFERENCES categories(id)
      `);
      console.log('✅ category_id column added');
    }

    const hasIsActive = await columnExists(client, 'products', 'is_active');
    if (!hasIsActive) {
      console.log('🔧 Adding missing is_active column to products table...');
      await client.query(`
        ALTER TABLE products 
        ADD COLUMN is_active BOOLEAN DEFAULT true
      `);
      console.log('✅ is_active column added');
    }
  }
}

// Function to seed default categories if table is empty
async function seedDefaultCategories(client) {
  console.log('🔍 Checking if categories need to be seeded...');
  
  const result = await client.query('SELECT COUNT(*) as count FROM categories');
  const categoryCount = parseInt(result.rows[0].count);
  
  if (categoryCount === 0) {
    console.log('🌱 Seeding default categories...');
    
    const defaultCategories = [
      { name: 'Electronics', description: 'Electronic devices and gadgets', icon: '📱' },
      { name: 'Clothing', description: 'Fashion and apparel', icon: '👕' },
      { name: 'Food & Beverages', description: 'Food, drinks, and groceries', icon: '🍕' },
      { name: 'Home & Garden', description: 'Home improvement and garden supplies', icon: '🏠' },
      { name: 'Sports & Recreation', description: 'Sports equipment and recreational items', icon: '⚽' },
      { name: 'Books & Media', description: 'Books, movies, music, and media', icon: '📚' },
      { name: 'Health & Beauty', description: 'Health, beauty, and personal care', icon: '💄' },
      { name: 'Automotive', description: 'Vehicle parts and accessories', icon: '🚗' },
      { name: 'Toys & Games', description: 'Toys, games, and entertainment', icon: '🎮' },
      { name: 'Services', description: 'Professional and personal services', icon: '🔧' }
    ];

    for (const category of defaultCategories) {
      await client.query(
        'INSERT INTO categories (name, description, icon, is_active) VALUES ($1, $2, $3, true)',
        [category.name, category.description, category.icon]
      );
    }
    
    console.log(`✅ Seeded ${defaultCategories.length} default categories`);
  } else {
    console.log(`ℹ️ Categories table already has ${categoryCount} entries`);
  }
}

// Main fix function
async function fixDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Starting database fix process...');
    
    await client.query('BEGIN');
    
    // Fix categories table
    await fixCategoriesTable(client);
    
    // Fix other common issues
    await fixCommonIssues(client);
    
    // Seed default categories if needed
    await seedDefaultCategories(client);
    
    await client.query('COMMIT');
    
    console.log('✅ Database fix completed successfully!');
    
    // Test the fixed queries
    console.log('\n🧪 Testing fixed queries...');
    
    const testResult = await client.query(`
      SELECT c.*, 
        (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) as product_count,
        (SELECT COUNT(*) FROM categories child WHERE child.parent_id = c.id) as subcategory_count
      FROM categories c
      WHERE c.is_active = true
      ORDER BY c.name ASC
      LIMIT 5
    `);
    
    console.log(`✅ Test query successful! Retrieved ${testResult.rows.length} categories`);
    
    if (testResult.rows.length > 0) {
      console.log('Sample category:', {
        id: testResult.rows[0].id,
        name: testResult.rows[0].name,
        product_count: testResult.rows[0].product_count,
        subcategory_count: testResult.rows[0].subcategory_count
      });
    }
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Database fix failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Function to get database status
async function getDatabaseStatus() {
  const client = await pool.connect();
  
  try {
    console.log('📊 Database Status Report:');
    console.log('='.repeat(50));
    
    // Check all tables
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log(`📋 Tables found: ${tables.rows.length}`);
    for (const table of tables.rows) {
      console.log(`  - ${table.table_name}`);
    }
    
    // Check categories table specifically
    const hasCategoriesTable = await tableExists(client, 'categories');
    if (hasCategoriesTable) {
      const categoriesColumns = await client.query(`
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'categories'
        ORDER BY ordinal_position
      `);
      
      console.log('\n📋 Categories table columns:');
      for (const col of categoriesColumns.rows) {
        console.log(`  - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
      }
      
      const categoryCount = await client.query('SELECT COUNT(*) as count FROM categories');
      console.log(`📊 Categories count: ${categoryCount.rows[0].count}`);
    } else {
      console.log('❌ Categories table does not exist');
    }
    
  } catch (error) {
    console.error('❌ Error getting database status:', error);
  } finally {
    client.release();
  }
}

// Database query methods - ALL YOUR EXISTING PRODUCT QUERIES PRESERVED
const dbQueries = {
  // Generic query method
  query,

  // User queries
  findUserByEmail: async (email) => {
    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0];
  },

  findUserById: async (id) => {
    const result = await query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0];
  },

  createUser: async (userData) => {
    const {
      name, email, password_hash, phone, user_type, shop_name
    } = userData;

    const result = await query(
      `INSERT INTO users (name, email, password_hash, phone, user_type, shop_name, is_active, is_verified)
       VALUES ($1, $2, $3, $4, $5, $6, true, false)
       RETURNING *`,
      [name, email, password_hash, phone, user_type, shop_name]
    );
    return result.rows[0];
  },

  updateUser: async (id, userData) => {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.entries(userData).forEach(([key, value]) => {
      if (value !== undefined) {
        fields.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    });

    if (fields.length === 0) return null;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const result = await query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0];
  },

  updateUserLastLogin: async (id) => {
    await query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );
  },

  getUserPasswordHash: async (id) => {
    const result = await query(
      'SELECT id, password_hash FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0];
  },

  updateUserPassword: async (id, passwordHash) => {
    await query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [passwordHash, id]
    );
  },

  verifyUserEmail: async (id) => {
    await query(
      'UPDATE users SET is_verified = true, email_verified_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );
  },

  createUserSettings: async (userId) => {
    try {
      const result = await query(
        'INSERT INTO user_settings (user_id) VALUES ($1) RETURNING *',
        [userId]
      );
      return result.rows[0];
    } catch (error) {
      // Table might not exist, that's okay
      console.warn('user_settings table not found, skipping...');
      return null;
    }
  },

  // Product queries - ALL YOUR EXISTING CODE PRESERVED
  createProduct: async (productData) => {
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
    `INSERT INTO products (
      seller_id, category_id, name, description, price, quantity, 
      image_url, images, is_featured, is_on_sale, original_price, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true) 
    RETURNING *`,
    [
      seller_id, category_id, name, description, price, quantity,
      image_url, images ? JSON.stringify(images) : null, 
      is_featured, is_on_sale, original_price
    ]
  );
  return result.rows[0];
},

getProductById: async (id) => {
  const result = await query(
    `SELECT p.*, c.name as category_name, u.name as seller_name, u.shop_name
     FROM products p
     LEFT JOIN categories c ON p.category_id = c.id
     LEFT JOIN users u ON p.seller_id = u.id
     WHERE p.id = $1`,
    [id]
  );
  return result.rows[0];
},

updateProduct: async (id, productData) => {
  const fields = [];
  const values = [];
  let paramCount = 1;

  Object.entries(productData).forEach(([key, value]) => {
    if (value !== undefined) {
      fields.push(`${key} = $${paramCount}`);
      values.push(key === 'images' && typeof value === 'object' ? JSON.stringify(value) : value);
      paramCount++;
    }
  });

  if (fields.length === 0) return null;

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  const result = await query(
    `UPDATE products SET ${fields.join(', ')} 
     WHERE id = $${paramCount} AND is_active = true 
     RETURNING *`,
    values
  );
  return result.rows[0];
},

deleteProduct: async (id) => {
  const result = await query(
    'UPDATE products SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
    [id]
  );
  return result.rows[0];
},

// Cart queries
getCartItems: async (userId) => {
  const result = await query(
    `SELECT ci.*, p.name, p.price, p.image_url, p.quantity as available_quantity,
            u.name as seller_name, u.shop_name,
            (ci.price * ci.quantity) as subtotal
     FROM cart_items ci
     JOIN products p ON ci.product_id = p.id
     JOIN users u ON p.seller_id = u.id
     WHERE ci.user_id = $1 AND p.is_active = true
     ORDER BY ci.created_at DESC`,
    [userId]
  );
  return result.rows;
},

addToCart: async (userId, productId, quantity) => {
  const result = await query(
    `INSERT INTO cart_items (user_id, product_id, quantity) 
     VALUES ($1, $2, $3) 
     ON CONFLICT (user_id, product_id) 
     DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity, updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [userId, productId, quantity]
  );
  return result.rows[0];
},

updateCartItem: async (userId, productId, quantity) => {
  const result = await query(
    `UPDATE cart_items 
     SET quantity = $3, updated_at = CURRENT_TIMESTAMP 
     WHERE user_id = $1 AND product_id = $2 
     RETURNING *`,
    [userId, productId, quantity]
  );
  return result.rows[0];
},

removeFromCart: async (userId, productId) => {
  const result = await query(
    'DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2',
    [userId, productId]
  );
  return result.rowCount > 0;
},

clearCart: async (userId) => {
  const result = await query(
    'DELETE FROM cart_items WHERE user_id = $1',
    [userId]
  );
  return result.rowCount;
},

// Order queries
createOrder: async (orderData) => {
  const {
    order_number, buyer_id, seller_id, delivery_address_name, delivery_full_name,
    delivery_phone, delivery_address_line1, delivery_address_line2, delivery_city,
    delivery_state, delivery_zip_code, delivery_country, delivery_instructions,
    payment_method_type, payment_method_last4, subtotal, delivery_fee,
    service_fee, tax, total, estimated_delivery
  } = orderData;

  const result = await query(
    `INSERT INTO orders (
      order_number, buyer_id, seller_id, delivery_address_name, delivery_full_name,
      delivery_phone, delivery_address_line1, delivery_address_line2, delivery_city,
      delivery_state, delivery_zip_code, delivery_country, delivery_instructions,
      payment_method_type, payment_method_last4, subtotal, delivery_fee,
      service_fee, tax, total, estimated_delivery
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
    ) RETURNING *`,
    [
      order_number, buyer_id, seller_id, delivery_address_name, delivery_full_name,
      delivery_phone, delivery_address_line1, delivery_address_line2, delivery_city,
      delivery_state, delivery_zip_code, delivery_country, delivery_instructions,
      payment_method_type, payment_method_last4, subtotal, delivery_fee,
      service_fee, tax, total, estimated_delivery
    ]
  );
  return result.rows[0];
},

createOrderItem: async (orderItemData) => {
  const {
    order_id, product_id, product_name, product_image, 
    price, quantity, subtotal, seller_id
  } = orderItemData;

  const result = await query(
    `INSERT INTO order_items (
      order_id, product_id, product_name, product_image, 
      price, quantity, subtotal
    ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [order_id, product_id, product_name, product_image, price, quantity, subtotal]
  );
  return result.rows[0];
},

getOrderById: async (id) => {
  const result = await query(
    `SELECT o.*, 
            json_agg(
              json_build_object(
                'id', oi.id,
                'product_id', oi.product_id,
                'product_name', oi.product_name,
                'product_image', oi.product_image,
                'price', oi.price,
                'quantity', oi.quantity,
                'subtotal', oi.subtotal
              )
            ) as items,
            bu.name as buyer_name, bu.phone as buyer_phone,
            su.name as seller_name, su.phone as seller_phone, su.shop_name
     FROM orders o
     LEFT JOIN order_items oi ON o.id = oi.order_id
     LEFT JOIN users bu ON o.buyer_id = bu.id
     LEFT JOIN users su ON o.seller_id = su.id
     WHERE o.id = $1
     GROUP BY o.id, bu.name, bu.phone, su.name, su.phone, su.shop_name`,
    [id]
  );
  return result.rows[0];
},

updateOrderStatus: async (orderId, status, note) => {
  // Update order status
  await query(
    'UPDATE orders SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
    [orderId, status]
  );

  // Add to status history
  const result = await query(
    'INSERT INTO order_status_history (order_id, status, note) VALUES ($1, $2, $3) RETURNING *',
    [orderId, status, note]
  );
  
  return result.rows[0];
}
};

// Run the fix if this file is executed directly
if (require.main === module) {
  const command = process.argv[2];
  
  if (command === 'status') {
    getDatabaseStatus()
      .then(() => {
        console.log('\n✅ Status check completed');
        process.exit(0);
      })
      .catch((error) => {
        console.error('❌ Status check failed:', error);
        process.exit(1);
      });
  } else {
    fixDatabase()
      .then(() => {
        console.log('\n🎉 Database fix completed successfully!');
        process.exit(0);
      })
      .catch((error) => {
        console.error('💥 Database fix failed:', error);
        process.exit(1);
      });
  }
}

module.exports = { 
  fixDatabase, 
  getDatabaseStatus,
  columnExists,
  tableExists,
  indexExists,
  pool,
  query,
  transaction,
  dbQueries
};