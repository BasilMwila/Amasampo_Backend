// Fix order_items table by adding missing seller_id column
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/amasampo',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fixOrderItemsTable() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Fixing order_items table...');
    
    // Check if seller_id column exists
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'order_items' AND column_name = 'seller_id'
    `);
    
    if (columnCheck.rows.length === 0) {
      console.log('📋 Adding seller_id column to order_items table...');
      
      // Add seller_id column
      await client.query(`
        ALTER TABLE order_items 
        ADD COLUMN seller_id INTEGER REFERENCES users(id)
      `);
      
      console.log('✅ seller_id column added to order_items table');
      
      // Update existing order_items with seller_id from products table
      const updateResult = await client.query(`
        UPDATE order_items 
        SET seller_id = p.seller_id 
        FROM products p 
        WHERE order_items.product_id = p.id 
        AND order_items.seller_id IS NULL
      `);
      
      console.log(`✅ Updated ${updateResult.rowCount} existing order items with seller_id`);
      
    } else {
      console.log('✅ seller_id column already exists in order_items table');
    }
    
    // Show current table structure
    const columns = await client.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'order_items'
      ORDER BY ordinal_position
    `);
    
    console.log('📋 Current order_items table structure:');
    columns.rows.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    
  } catch (error) {
    console.error('❌ Error fixing order_items table:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the fix
fixOrderItemsTable()
  .then(() => {
    console.log('🎉 Order items table fix completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Fix failed:', error);
    process.exit(1);
  });