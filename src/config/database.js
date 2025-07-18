/* eslint-disable linebreak-style */
/* eslint-disable no-plusplus */
/* eslint-disable linebreak-style */
/* eslint-disable camelcase */
/* eslint-disable linebreak-style */
/* eslint-disable object-curly-newline */
/* eslint-disable linebreak-style */
/* eslint-disable no-return-await */
/* eslint-disable linebreak-style */
/* eslint-disable arrow-parens */
/* eslint-disable linebreak-style */
/* eslint-disable no-trailing-spaces */
/* eslint-disable linebreak-style */
/* eslint-disable eol-last */
/* eslint-disable operator-linebreak */
/* eslint-disable comma-dangle */
/* eslint-disable arrow-body-style */
/* eslint-disable linebreak-style */
// config/database.js - Your specific AWS Lightsail PostgreSQL configuration
const { Pool } = require('pg');
require('dotenv').config();

// Your specific database configuration
const dbConfig = {
  host: 'ls-cf31de6d33ef5ebb28072f9a30dc750a55411921.c0vyackkg5lk.us-east-1.rds.amazonaws.com',
  port: 5432,
  database: 'postgres',
  user: 'dbmasteruser',
  password: 'm53%a8fvp~s^~3Bxq}Qipw8kA]*J9h6_',
  
  // Connection pool settings
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  
  // SSL configuration for AWS Lightsail managed database
  ssl: {
    rejectUnauthorized: false, // Required for AWS managed databases
    require: true // Force SSL connection
  }
};

console.log('🔄 Initializing database connection to AWS Lightsail PostgreSQL...');
console.log('Database host:', dbConfig.host);
console.log('Database name:', dbConfig.database);
console.log('Username:', dbConfig.user);
console.log('SSL enabled:', dbConfig.ssl ? 'Yes' : 'No');

// Create connection pool
const pool = new Pool(dbConfig);

// Enhanced connection event handlers
pool.on('connect', (client) => {
  console.log('✅ Successfully connected to PostgreSQL database');
  console.log('Connection details:', {
    database: client.database,
    user: client.user,
    host: client.host,
    port: client.port,
    ssl: client.ssl ? 'enabled' : 'disabled'
  });
});

pool.on('error', (err) => {
  console.error('❌ Database pool error:', err.message);
  
  // Specific error handling for common issues
  switch (err.code) {
    case '28000':
      console.error('🔧 SOLUTION: Your IP address needs to be whitelisted in AWS Lightsail');
      console.error('   1. Go to https://lightsail.aws.amazon.com');
      console.error('   2. Navigate to Databases → Your PostgreSQL database');
      console.error('   3. Go to Networking tab → Edit PostgreSQL firewall rule');
      console.error('   4. Add your IP: 41.216.73.11/32');
      break;
    case 'ENOTFOUND':
      console.error('🔧 SOLUTION: Database hostname not found');
      break;
    case 'ECONNREFUSED':
      console.error('🔧 SOLUTION: Database is not accepting connections');
      break;
    case '3D000':
      console.error('🔧 SOLUTION: Database "postgres" does not exist');
      break;
    default:
      console.error('🔧 Unexpected database error. Check your configuration.');
  }
});

// Test connection function
const testConnection = async () => {
  let client;
  try {
    console.log('🔄 Testing database connection...');
    
    client = await pool.connect();
    console.log('✅ Database client connected successfully');
    
    // Test basic query
    const result = await client.query('SELECT NOW() as current_time, version() as postgres_version');
    console.log('✅ Database query executed successfully');
    console.log('📊 Server time:', result.rows[0].current_time);
    console.log('📊 PostgreSQL version:', result.rows[0].postgres_version.split(' ')[0]);
    
    // Test if our tables exist
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('📋 Tables in database:', tablesResult.rows.length);
    if (tablesResult.rows.length > 0) {
      console.log('   Tables found:', tablesResult.rows.map(row => row.table_name).join(', '));
    } else {
      console.log('   ⚠️  No tables found. You may need to run migrations.');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Database connection test failed');
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    
    if (error.code === '28000') {
      console.error('\n🚨 IP WHITELIST REQUIRED:');
      console.error('Your current IP (41.216.73.11) is not allowed to connect.');
      console.error('Please whitelist it in AWS Lightsail console.');
    }
    
    return false;
  } finally {
    if (client) {
      client.release();
    }
  }
};

// Enhanced query function with better error handling
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log(`🔍 Query executed in ${duration}ms`);
    return result;
  } catch (error) {
    console.error('❌ Query error:', error.message);
    
    // Provide helpful error context
    if (error.code === '42P01') {
      console.error('🔧 Table does not exist. Run: node scripts/migration.js');
    } else if (error.code === '23505') {
      console.error('🔧 Duplicate entry violation');
    } else if (error.code === '23503') {
      console.error('🔧 Foreign key constraint violation');
    }
    
    throw error;
  }
};

// Helper function to get a client from the pool
const getClient = async () => {
  return await pool.connect();
};

// Helper function for transactions
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

// Enhanced database queries with all methods needed for auth
const dbQueries = {
  // Add the query method that your auth.js is looking for
  query: (text, params) => query(text, params),
  
  // User queries
  findUserByEmail: async (email) => {
    const result = await query(
      'SELECT * FROM users WHERE email = $1 AND is_active = true',
      [email]
    );
    return result.rows[0];
  },

  findUserById: async (id) => {
    const result = await query(
      'SELECT id, uuid, name, email, phone, user_type, shop_name, avatar_url, is_active, is_verified, created_at FROM users WHERE id = $1 AND is_active = true',
      [id]
    );
    return result.rows[0];
  },

  createUser: async (userData) => {
    const { name, email, password_hash, phone, user_type, shop_name } = userData;
    const result = await query(
      `INSERT INTO users (name, email, password_hash, phone, user_type, shop_name) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, uuid, name, email, phone, user_type, shop_name, created_at`,
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

    values.push(id);
    const result = await query(
      `UPDATE users SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $${paramCount} AND is_active = true 
       RETURNING id, uuid, name, email, phone, user_type, shop_name, updated_at`,
      values
    );
    return result.rows[0];
  },

  // Additional methods needed for auth.js
  createUserSettings: async (userId) => {
    const result = await query(
      'INSERT INTO user_settings (user_id) VALUES ($1) RETURNING *',
      [userId]
    );
    return result.rows[0];
  },

  updateUserLastLogin: async (userId) => {
    await query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [userId]
    );
  },

  updateUserPassword: async (userId, passwordHash) => {
    await query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [passwordHash, userId]
    );
  },

  verifyUserEmail: async (userId) => {
    await query(
      'UPDATE users SET is_verified = true, email_verified_at = CURRENT_TIMESTAMP WHERE id = $1',
      [userId]
    );
  },

  getUserPasswordHash: async (userId) => {
    const result = await query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );
    return result.rows[0];
  },

  // Test query to verify connection
  testQuery: async () => {
    const result = await query('SELECT 1 as test, NOW() as time');
    return result.rows[0];
  }
};

// Test connection on startup
testConnection().then(success => {
  if (success) {
    console.log('🎉 Database ready for use!');
  } else {
    console.log('⚠️  Database connection failed - server will start but database features won\'t work');
  }
});

module.exports = {
  pool,
  query,
  getClient,
  transaction,
  dbQueries,
  testConnection
};