/* eslint-disable linebreak-style */
/* eslint-disable max-len */
/* eslint-disable linebreak-style */
/* eslint-disable no-continue */
/* eslint-disable linebreak-style */
/* eslint-disable no-whitespace-before-property */
/* eslint-disable linebreak-style */
/* eslint-disable global-require */
/* eslint-disable padded-blocks */
/* eslint-disable linebreak-style */
/* eslint-disable no-multiple-empty-lines */

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
// scripts/setup-for-testing.js - Complete setup script to fix login issues
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
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

async function testConnection() {
  console.log('🔌 Testing database connection...');
  
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW(), version()');
    console.log('✅ Database connection successful!');
    console.log(`📅 Server time: ${result.rows[0].now}`);
    console.log(`📊 PostgreSQL version: ${result.rows[0].version.split(' ')[0]}`);
    client.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('💡 Check your .env file and database credentials');
    return false;
  }
}

async function checkAndCreateTables() {
  console.log('\n📋 Checking and creating necessary tables...');
  
  const client = await pool.connect();
  try {
    // Check if users table exists
    const userTableCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'users' AND table_schema = 'public'
    `);
    
    if (userTableCheck.rows.length === 0) {
      console.log('📋 Creating users table...');
      await client.query(`
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          uuid UUID DEFAULT gen_random_uuid() UNIQUE,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          phone VARCHAR(20),
          user_type VARCHAR(20) NOT NULL DEFAULT 'buyer' CHECK (user_type IN ('buyer', 'seller')),
          shop_name VARCHAR(255),
          avatar_url TEXT,
          is_active BOOLEAN DEFAULT true,
          is_verified BOOLEAN DEFAULT false,
          email_verified_at TIMESTAMP,
          last_login TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_users_user_type ON users(user_type);
        CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
      `);
      console.log('✅ Users table created');
    } else {
      console.log('✅ Users table already exists');
      
      // Check if required columns exist
      const columns = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users'
      `);
      
      const columnNames = columns.rows.map(row => row.column_name);
      const requiredColumns = ['user_type', 'shop_name', 'is_active', 'is_verified'];
      
      for (const col of requiredColumns) {
        if (!columnNames.includes(col)) {
          console.log(`🔧 Adding missing column: ${col}`);
          if (col === 'user_type') {
            await client.query(`
              ALTER TABLE users 
              ADD COLUMN user_type VARCHAR(20) NOT NULL DEFAULT 'buyer' 
              CHECK (user_type IN ('buyer', 'seller'))
            `);
          } else if (col === 'shop_name') {
            await client.query(`ALTER TABLE users ADD COLUMN shop_name VARCHAR(255)`);
          } else if (col === 'is_active') {
            await client.query(`ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT true`);
          } else if (col === 'is_verified') {
            await client.query(`ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT false`);
          }
        }
      }
    }
    
    // Check if categories table exists
    const categoryTableCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'categories' AND table_schema = 'public'
    `);
    
    if (categoryTableCheck.rows.length === 0) {
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
        );
        
        CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
        CREATE INDEX IF NOT EXISTS idx_categories_is_active ON categories(is_active);
      `);
      console.log('✅ Categories table created');
    } else {
      console.log('✅ Categories table already exists');
    }
    
    console.log('✅ All required tables are ready');
    return true;
    
  } catch (error) {
    console.error('❌ Error creating tables:', error.message);
    return false;
  } finally {
    client.release();
  }
}

async function createTestUsers() {
  console.log('\n👤 Creating test users...');
  
  const client = await pool.connect();
  try {
    // Test users to create
    const testUsers = [
      {
        name: 'Test Buyer',
        email: 'test@example.com',
        password: 'password123',
        phone: '+260977123456',
        user_type: 'buyer',
        shop_name: null
      },
      {
        name: 'Test Seller',
        email: 'seller@example.com',
        password: 'password123',
        phone: '+260977654321',
        user_type: 'seller',
        shop_name: 'Test Shop'
      },
      {
        name: 'John Doe',
        email: 'john@test.com',
        password: 'test123',
        phone: '+260977111222',
        user_type: 'buyer',
        shop_name: null
      }
    ];
    
    for (const userData of testUsers) {
      // Check if user already exists
      const existingUser = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [userData.email]
      );
      
      if (existingUser.rows.length > 0) {
        console.log(`✅ User ${userData.email} already exists`);
        continue;
      }
      
      // Create user
      const hashedPassword = await bcrypt.hash(userData.password, 12);
      const result = await client.query(
        `INSERT INTO users (name, email, password_hash, phone, user_type, shop_name, is_active, is_verified)
         VALUES ($1, $2, $3, $4, $5, $6, true, true)
         RETURNING id, email, name, user_type`,
        [userData.name, userData.email, hashedPassword, userData.phone, userData.user_type, userData.shop_name]
      );
      
      console.log('✅ Created user:', result.rows[0]);
    }
    
    console.log('\n📧 Test login credentials:');
    console.log('Buyer Account:');
    console.log('  Email: test@example.com');
    console.log('  Password: password123');
    console.log('\nSeller Account:');
    console.log('  Email: seller@example.com');
    console.log('  Password: password123');
    console.log('\nAlternative Account:');
    console.log('  Email: john@test.com');
    console.log('  Password: test123');
    
  } catch (error) {
    console.error('❌ Error creating test users:', error.message);
  } finally {
    client.release();
  }
}

async function seedCategories() {
  console.log('\n📂 Setting up categories...');
  
  const client = await pool.connect();
  try {
    // Check if categories exist
    const result = await client.query('SELECT COUNT(*) as count FROM categories');
    const count = parseInt(result.rows[0].count);
    
    if (count > 0) {
      console.log(`✅ Categories already exist (${count} found)`);
      return;
    }
    
    // Create default categories
    const categories = [
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
    
    for (const category of categories) {
      await client.query(
        'INSERT INTO categories (name, description, icon, is_active) VALUES ($1, $2, $3, true)',
        [category.name, category.description, category.icon]
      );
    }
    
    console.log(`✅ Created ${categories.length} default categories`);
    
  } catch (error) {
    console.error('❌ Error seeding categories:', error.message);
  } finally {
    client.release();
  }
}

async function testQueries() {
  console.log('\n🧪 Testing critical queries...');
  
  const client = await pool.connect();
  try {
    // Test user login query
    console.log('Testing user login query...');
    const userTest = await client.query(
      'SELECT id, name, email, user_type, is_active FROM users WHERE email = $1',
      ['test@example.com']
    );
    
    if (userTest.rows.length > 0) {
      console.log('✅ User query successful:', userTest.rows[0]);
    } else {
      console.log('⚠️ No test user found');
    }
    
    // Test categories query
    console.log('Testing categories query...');
    const categoriesTest = await client.query(`
      SELECT c.*, 
        (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) as product_count,
        (SELECT COUNT(*) FROM categories child WHERE child.parent_id = c.id) as subcategory_count
      FROM categories c
      WHERE c.is_active = true
      LIMIT 3
    `);
    
    console.log('✅ Categories query successful:', categoriesTest.rows.length, 'categories found');
    
    console.log('✅ All critical queries working');
    
  } catch (error) {
    console.error('❌ Query test failed:', error.message);
  } finally {
    client.release();
  }
}

async function checkServerRequirements() {
  console.log('\n🔍 Checking server requirements...');
  
  // Check if required files exist
  const fs = require('fs');
  const path = require('path');
  
  const requiredFiles = [
    'src/config/database.js',
    'src/middleware/auth.js',
    'src/middleware/errorHandler.js',
    'src/routes/auth.js',
    'src/utils/password.js'
  ];
  
  let allFilesExist = true;
  
  for (const file of requiredFiles) {
    if (fs.existsSync(path.join(__dirname, '..', file))) {
      console.log(`✅ ${file} exists`);
    } else {
      console.log(`❌ ${file} missing`);
      allFilesExist = false;
    }
  }
  
  if (allFilesExist) {
    console.log('✅ All required files exist');
  } else {
    console.log('⚠️ Some required files are missing');
  }
  
  // Check environment variables
  console.log('\n🌍 Checking environment variables...');
  const requiredEnvVars = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET'];
  
  let allEnvVarsSet = true;
  for (const envVar of requiredEnvVars) {
    if (process.env[envVar]) {
      console.log(`✅ ${envVar} is set`);
    } else {
      console.log(`❌ ${envVar} is missing`);
      allEnvVarsSet = false;
    }
  }
  
  if (!allEnvVarsSet) {
    console.log('⚠️ Some environment variables are missing. Check your .env file');
  }
  
  return allFilesExist && allEnvVarsSet;
}

async function runCompleteSetup() {
  console.log('🚀 Starting complete database setup for testing...');
  console.log('=' .repeat(60));
  
  try {
    // Step 1: Test connection
    const connectionOk = await testConnection();
    if (!connectionOk) {
      console.log('\n❌ Cannot proceed - database connection failed');
      process.exit(1);
    }
    
    // Step 2: Check server requirements
    const requirementsOk = await checkServerRequirements();
    if (!requirementsOk) {
      console.log('\n⚠️ Some requirements are missing, but continuing...');
    }
    
    // Step 3: Create/check tables
    const tablesOk = await checkAndCreateTables();
    if (!tablesOk) {
      console.log('\n❌ Failed to create required tables');
      process.exit(1);
    }
    
    // Step 4: Create test users
    await createTestUsers();
    
    // Step 5: Seed categories
    await seedCategories();
    
    // Step 6: Test queries
    await testQueries();
    
    console.log('\n🎉 Database setup completed successfully!');
    console.log('=' .repeat(60));
    console.log('\n✅ Next steps:');
    console.log('1. Restart your server: npm start');
    console.log('2. Test the health endpoint: GET /health');
    console.log('3. Test login with the credentials above');
    console.log('4. Register new users via POST /api/auth/register');
    
    console.log('\n🔧 Troubleshooting:');
    console.log('- If you still get 500 errors, check server logs');
    console.log('- If you get 429 errors, wait 15 minutes or restart server');
    console.log('- Rate limiting is now relaxed for development');
    
  } catch (error) {
    console.error('💥 Setup failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  runCompleteSetup();
} else {
  module.exports = { 
    testConnection, 
    checkAndCreateTables, 
    createTestUsers, 
    seedCategories,
    testQueries,
    checkServerRequirements
  };
}