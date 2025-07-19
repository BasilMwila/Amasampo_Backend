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
// scripts/check-database.js - Quick database schema checker
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

async function checkDatabaseSchema() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Checking Database Schema...');
    console.log('='.repeat(60));
    
    // Test basic connection
    console.log('📡 Testing database connection...');
    const connectionTest = await client.query('SELECT NOW() as current_time, version() as version');
    console.log('✅ Connection successful');
    console.log(`   Time: ${connectionTest.rows[0].current_time}`);
    console.log(`   Version: ${connectionTest.rows[0].version.split(' ')[0]}`);
    
    console.log('\n📋 Checking Tables...');
    console.log('-'.repeat(40));
    
    // Check all tables
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    const tables = tablesResult.rows.map(row => row.table_name);
    console.log(`Found ${tables.length} tables:`);
    
    for (const tableName of tables) {
      // Get column info for each table
      const columnsResult = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);
      
      console.log(`\n📋 ${tableName.toUpperCase()}`);
      console.log('   Columns:');
      
      for (const col of columnsResult.rows) {
        const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
        const defaultValue = col.column_default ? ` DEFAULT ${col.column_default}` : '';
        console.log(`     - ${col.column_name} (${col.data_type}) ${nullable}${defaultValue}`);
      }
      
      // Get row count
      try {
        const countResult = await client.query(`SELECT COUNT(*) as count FROM ${tableName}`);
        console.log(`   Rows: ${countResult.rows[0].count}`);
      } catch (error) {
        console.log(`   Rows: Error counting (${error.message})`);
      }
    }
    
    console.log('\n🔍 Testing Specific Queries...');
    console.log('-'.repeat(40));
    
    // Test categories query specifically
    if (tables.includes('categories')) {
      console.log('\n🧪 Testing categories queries...');
      
      try {
        // Test basic categories query
        const basicQuery = await client.query('SELECT * FROM categories LIMIT 3');
        console.log(`✅ Basic categories query: ${basicQuery.rows.length} rows`);
        
        // Test the problematic query
        const problemQuery = await client.query(`
          SELECT c.*, 
            (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) as product_count,
            (SELECT COUNT(*) FROM categories child WHERE child.parent_id = c.id) as subcategory_count
          FROM categories c
          WHERE c.is_active = true
          LIMIT 3
        `);
        console.log(`✅ Complex categories query: ${problemQuery.rows.length} rows`);
        
        if (problemQuery.rows.length > 0) {
          console.log('   Sample result:');
          const sample = problemQuery.rows[0];
          console.log(`     ID: ${sample.id}, Name: ${sample.name}`);
          console.log(`     Product count: ${sample.product_count}`);
          console.log(`     Subcategory count: ${sample.subcategory_count}`);
        }
        
      } catch (error) {
        console.log(`❌ Categories query failed: ${error.message}`);
        console.log(`   Error code: ${error.code}`);
        
        // Check if parent_id column exists
        const parentIdCheck = await client.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'categories' AND column_name = 'parent_id'
        `);
        
        if (parentIdCheck.rows.length === 0) {
          console.log('❌ parent_id column is missing from categories table');
          console.log('💡 Run: node scripts/fix-database.js to fix this');
        } else {
          console.log('✅ parent_id column exists');
        }
      }
    } else {
      console.log('❌ Categories table does not exist');
      console.log('💡 Run: node scripts/migration.js to create tables');
    }
    
    // Test products query if table exists
    if (tables.includes('products')) {
      console.log('\n🧪 Testing products queries...');
      
      try {
        const productsQuery = await client.query(`
          SELECT p.*, c.name as category_name 
          FROM products p 
          LEFT JOIN categories c ON p.category_id = c.id 
          LIMIT 3
        `);
        console.log(`✅ Products with categories query: ${productsQuery.rows.length} rows`);
      } catch (error) {
        console.log(`❌ Products query failed: ${error.message}`);
      }
    }
    
    console.log('\n🔍 Checking Indexes...');
    console.log('-'.repeat(40));
    
    const indexesResult = await client.query(`
      SELECT schemaname, tablename, indexname, indexdef
      FROM pg_indexes 
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `);
    
    console.log(`Found ${indexesResult.rows.length} indexes:`);
    
    const indexesByTable = {};
    for (const index of indexesResult.rows) {
      if (!indexesByTable[index.tablename]) {
        indexesByTable[index.tablename] = [];
      }
      indexesByTable[index.tablename].push(index.indexname);
    }
    
    for (const [tableName, indexes] of Object.entries(indexesByTable)) {
      console.log(`\n📋 ${tableName.toUpperCase()}`);
      console.log(`   Indexes: ${indexes.join(', ')}`);
    }
    
    console.log('\n🔍 Checking Foreign Keys...');
    console.log('-'.repeat(40));
    
    const foreignKeysResult = await client.query(`
      SELECT
        tc.table_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name 
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      ORDER BY tc.table_name, kcu.column_name
    `);
    
    console.log(`Found ${foreignKeysResult.rows.length} foreign keys:`);
    
    for (const fk of foreignKeysResult.rows) {
      console.log(`   ${fk.table_name}.${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`);
    }
    
    console.log('\n✅ Database schema check completed!');
    
  } catch (error) {
    console.error('❌ Schema check failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Function to test specific query
async function testQuery(queryText, params = []) {
  const client = await pool.connect();
  
  try {
    console.log('🧪 Testing custom query...');
    console.log('Query:', queryText);
    if (params.length > 0) {
      console.log('Parameters:', params);
    }
    
    const result = await client.query(queryText, params);
    console.log(`✅ Query successful: ${result.rows.length} rows returned`);
    
    if (result.rows.length > 0) {
      console.log('Sample result:');
      console.log(JSON.stringify(result.rows[0], null, 2));
    }
    
    return result;
  } catch (error) {
    console.error('❌ Query failed:', error.message);
    console.error('Error code:', error.code);
    throw error;
  } finally {
    client.release();
  }
}

// Function to quickly check if categories API will work
async function checkCategoriesAPI() {
  console.log('🔍 Checking Categories API Compatibility...');
  console.log('='.repeat(50));
  
  const queries = [
    {
      name: 'Basic categories query',
      query: 'SELECT * FROM categories WHERE is_active = true LIMIT 5'
    },
    {
      name: 'Categories with product count',
      query: `SELECT c.*, 
        (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_active = true) as product_count
        FROM categories c 
        WHERE c.is_active = true 
        LIMIT 5`
    },
    {
      name: 'Categories with subcategory count (requires parent_id)',
      query: `SELECT c.*, 
        (SELECT COUNT(*) FROM categories child WHERE child.parent_id = c.id AND child.is_active = true) as subcategory_count
        FROM categories c 
        WHERE c.is_active = true 
        LIMIT 5`
    },
    {
      name: 'Full categories API query',
      query: `SELECT c.*, 
        (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_active = true) as product_count,
        (SELECT COUNT(*) FROM categories child WHERE child.parent_id = c.id AND child.is_active = true) as subcategory_count
        FROM categories c
        WHERE c.is_active = true
        ORDER BY c.name ASC
        LIMIT 5`
    }
  ];
  
  for (const { name, query } of queries) {
    try {
      console.log(`\n🧪 ${name}...`);
      const result = await testQuery(query);
      console.log(`✅ Success: ${result.rows.length} rows`);
    } catch (error) {
      console.log(`❌ Failed: ${error.message}`);
      
      if (error.message.includes('parent_id')) {
        console.log('💡 Fix: Run `node scripts/fix-database.js` to add missing parent_id column');
      }
    }
  }
}

// Main execution
if (require.main === module) {
  const command = process.argv[2];
  const customQuery = process.argv[3];
  
  if (command === 'query' && customQuery) {
    testQuery(customQuery)
      .then(() => {
        console.log('\n✅ Custom query test completed');
        process.exit(0);
      })
      .catch((error) => {
        console.error('❌ Custom query test failed:', error);
        process.exit(1);
      });
  } else if (command === 'categories') {
    checkCategoriesAPI()
      .then(() => {
        console.log('\n✅ Categories API check completed');
        process.exit(0);
      })
      .catch((error) => {
        console.error('❌ Categories API check failed:', error);
        process.exit(1);
      });
  } else {
    checkDatabaseSchema()
      .then(() => {
        console.log('\n✅ Database schema check completed');
        process.exit(0);
      })
      .catch((error) => {
        console.error('❌ Database schema check failed:', error);
        process.exit(1);
      });
  }
}

module.exports = { 
  checkDatabaseSchema, 
  testQuery, 
  checkCategoriesAPI 
};