// config/database.js - Database configuration and connection
const { Pool } = require('pg');
require('dotenv').config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'amasampo_marketplace',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  max: 20, // Maximum number of connections
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

// Create connection pool
const pool = new Pool(dbConfig);

// Test database connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Database connection error:', err);
});

// Helper function to execute queries
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log(`🔍 Query executed in ${duration}ms:`, text.substring(0, 100));
    return result;
  } catch (error) {
    console.error('❌ Query error:', error);
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

// Common query functions
const dbQueries = {
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

  // Product queries
  getAllProducts: async (filters = {}) => {
    let queryText = `
      SELECT p.*, c.name as category_name, u.name as seller_name, u.shop_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON p.seller_id = u.id
      WHERE p.is_active = true
    `;
    const params = [];
    let paramCount = 1;

    if (filters.category_id) {
      queryText += ` AND p.category_id = $${paramCount}`;
      params.push(filters.category_id);
      paramCount++;
    }

    if (filters.seller_id) {
      queryText += ` AND p.seller_id = $${paramCount}`;
      params.push(filters.seller_id);
      paramCount++;
    }

    if (filters.search) {
      queryText += ` AND (p.name ILIKE $${paramCount} OR p.description ILIKE $${paramCount})`;
      params.push(`%${filters.search}%`);
      paramCount++;
    }

    if (filters.is_featured) {
      queryText += ` AND p.is_featured = true`;
    }

    queryText += ' ORDER BY p.created_at DESC';

    if (filters.limit) {
      queryText += ` LIMIT $${paramCount}`;
      params.push(filters.limit);
      paramCount++;
    }

    if (filters.offset) {
      queryText += ` OFFSET $${paramCount}`;
      params.push(filters.offset);
    }

    const result = await query(queryText, params);
    return result.rows;
  },

  getProductById: async (id) => {
    const result = await query(
      `SELECT p.*, c.name as category_name, u.name as seller_name, u.shop_name, u.phone as seller_phone
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN users u ON p.seller_id = u.id
       WHERE p.id = $1 AND p.is_active = true`,
      [id]
    );
    return result.rows[0];
  },

  createProduct: async (productData) => {
    const { seller_id, category_id, name, description, price, quantity, image_url } = productData;
    const result = await query(
      `INSERT INTO products (seller_id, category_id, name, description, price, quantity, image_url) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [seller_id, category_id, name, description, price, quantity, image_url]
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
        values.push(value);
        paramCount++;
      }
    });

    if (fields.length === 0) return null;

    values.push(id);
    const result = await query(
      `UPDATE products SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $${paramCount} AND is_active = true 
       RETURNING *`,
      values
    );
    return result.rows[0];
  },

  deleteProduct: async (id) => {
    const result = await query(
      'UPDATE products SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id',
      [id]
    );
    return result.rows[0];
  },

  // Order queries
  createOrder: async (orderData) => {
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
        orderData.order_number, orderData.buyer_id, orderData.seller_id,
        orderData.delivery_address_name, orderData.delivery_full_name,
        orderData.delivery_phone, orderData.delivery_address_line1,
        orderData.delivery_address_line2, orderData.delivery_city,
        orderData.delivery_state, orderData.delivery_zip_code,
        orderData.delivery_country, orderData.delivery_instructions,
        orderData.payment_method_type, orderData.payment_method_last4,
        orderData.subtotal, orderData.delivery_fee, orderData.service_fee,
        orderData.tax, orderData.total, orderData.estimated_delivery
      ]
    );
    return result.rows[0];
  },

  createOrderItem: async (orderItemData) => {
    const result = await query(
      `INSERT INTO order_items (order_id, product_id, product_name, product_image, price, quantity, subtotal)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        orderItemData.order_id, orderItemData.product_id, orderItemData.product_name,
        orderItemData.product_image, orderItemData.price, orderItemData.quantity,
        orderItemData.subtotal
      ]
    );
    return result.rows[0];
  },

  getUserOrders: async (userId, userType) => {
    const field = userType === 'buyer' ? 'buyer_id' : 'seller_id';
    const result = await query(
      `SELECT o.*, 
        json_agg(
          json_build_object(
            'id', oi.id,
            'product_name', oi.product_name,
            'product_image', oi.product_image,
            'price', oi.price,
            'quantity', oi.quantity,
            'subtotal', oi.subtotal
          )
        ) as items
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE o.${field} = $1
       GROUP BY o.id
       ORDER BY o.created_at DESC`,
      [userId]
    );
    return result.rows;
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

  updateOrderStatus: async (orderId, status, note = null) => {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      
      // Update order status
      await client.query(
        'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [status, orderId]
      );
      
      // Add status to history
      await client.query(
        'INSERT INTO order_status_history (order_id, status, note) VALUES ($1, $2, $3)',
        [orderId, status, note]
      );
      
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  // Cart queries
  getCartItems: async (userId) => {
    const result = await query(
      `SELECT ci.*, p.name, p.price, p.image_url, p.quantity as available_quantity,
        u.name as seller_name, u.shop_name
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
       DO UPDATE SET quantity = cart_items.quantity + $3, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [userId, productId, quantity]
    );
    return result.rows[0];
  },

  updateCartItem: async (userId, productId, quantity) => {
    const result = await query(
      `UPDATE cart_items SET quantity = $3, updated_at = CURRENT_TIMESTAMP 
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
  }
};

module.exports = {
  pool,
  query,
  getClient,
  transaction,
  dbQueries
};