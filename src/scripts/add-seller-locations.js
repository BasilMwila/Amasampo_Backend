// scripts/add-seller-locations.js - Add location fields to users table for sellers
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

// Function to add seller location fields
async function addSellerLocationFields() {
  const client = await pool.connect();
  
  try {
    console.log('🗺️  Adding location fields to users table for sellers...');
    
    // Add shop_address field
    const hasShopAddress = await columnExists(client, 'users', 'shop_address');
    if (!hasShopAddress) {
      console.log('🔧 Adding shop_address column...');
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN shop_address TEXT
      `);
      console.log('✅ shop_address column added');
    } else {
      console.log('ℹ️  shop_address column already exists');
    }

    // Add shop_city field
    const hasShopCity = await columnExists(client, 'users', 'shop_city');
    if (!hasShopCity) {
      console.log('🔧 Adding shop_city column...');
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN shop_city VARCHAR(100)
      `);
      console.log('✅ shop_city column added');
    } else {
      console.log('ℹ️  shop_city column already exists');
    }

    // Add shop_state field
    const hasShopState = await columnExists(client, 'users', 'shop_state');
    if (!hasShopState) {
      console.log('🔧 Adding shop_state column...');
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN shop_state VARCHAR(50)
      `);
      console.log('✅ shop_state column added');
    } else {
      console.log('ℹ️  shop_state column already exists');
    }

    // Add shop_country field
    const hasShopCountry = await columnExists(client, 'users', 'shop_country');
    if (!hasShopCountry) {
      console.log('🔧 Adding shop_country column...');
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN shop_country VARCHAR(50) DEFAULT 'Ghana'
      `);
      console.log('✅ shop_country column added');
    } else {
      console.log('ℹ️  shop_country column already exists');
    }

    // Add latitude field
    const hasLatitude = await columnExists(client, 'users', 'latitude');
    if (!hasLatitude) {
      console.log('🔧 Adding latitude column...');
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN latitude DECIMAL(10, 8)
      `);
      console.log('✅ latitude column added');
    } else {
      console.log('ℹ️  latitude column already exists');
    }

    // Add longitude field
    const hasLongitude = await columnExists(client, 'users', 'longitude');
    if (!hasLongitude) {
      console.log('🔧 Adding longitude column...');
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN longitude DECIMAL(11, 8)
      `);
      console.log('✅ longitude column added');
    } else {
      console.log('ℹ️  longitude column already exists');
    }

    // Add business_hours field (JSON field for flexible hours)
    const hasBusinessHours = await columnExists(client, 'users', 'business_hours');
    if (!hasBusinessHours) {
      console.log('🔧 Adding business_hours column...');
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN business_hours JSONB
      `);
      console.log('✅ business_hours column added');
    } else {
      console.log('ℹ️  business_hours column already exists');
    }

    // Add shop_description field
    const hasShopDescription = await columnExists(client, 'users', 'shop_description');
    if (!hasShopDescription) {
      console.log('🔧 Adding shop_description column...');
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN shop_description TEXT
      `);
      console.log('✅ shop_description column added');
    } else {
      console.log('ℹ️  shop_description column already exists');
    }

    // Create index for location-based queries
    try {
      console.log('🔧 Creating location index...');
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_users_location ON users(latitude, longitude) 
        WHERE user_type = 'seller' AND latitude IS NOT NULL AND longitude IS NOT NULL
      `);
      console.log('✅ Location index created');
    } catch (error) {
      console.log('ℹ️  Location index already exists or creation failed');
    }

    // Create index for city-based queries
    try {
      console.log('🔧 Creating city index...');
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_users_shop_city ON users(shop_city) 
        WHERE user_type = 'seller' AND shop_city IS NOT NULL
      `);
      console.log('✅ City index created');
    } catch (error) {
      console.log('ℹ️  City index already exists or creation failed');
    }

    console.log('✅ Seller location fields added successfully!');
    
    // Show the updated user table structure
    const columns = await client.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);
    
    console.log('\n📋 Updated users table structure:');
    columns.rows.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });

  } catch (error) {
    console.error('❌ Error adding seller location fields:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run the script if executed directly
if (require.main === module) {
  addSellerLocationFields()
    .then(() => {
      console.log('\n🎉 Seller location fields added successfully!');
      console.log('📝 New fields added:');
      console.log('  ✅ shop_address - Full address of the shop');
      console.log('  ✅ shop_city - City where shop is located');
      console.log('  ✅ shop_state - State/Region of the shop');
      console.log('  ✅ shop_country - Country (defaults to Ghana)');
      console.log('  ✅ latitude - GPS latitude coordinate');
      console.log('  ✅ longitude - GPS longitude coordinate');
      console.log('  ✅ business_hours - Operating hours (JSON format)');
      console.log('  ✅ shop_description - Description of the shop');
      console.log('\n🗺️  Your sellers can now have locations for the map feature!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Script failed:', error);
      process.exit(1);
    });
}

module.exports = { addSellerLocationFields };