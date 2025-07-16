// scripts/seed.js - Database seeding script
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'postgre',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
});

// Sample data
const seedData = {
  categories: [
    { name: 'Electronics', description: 'Phones, computers, and gadgets', icon: '📱' },
    { name: 'Clothing', description: 'Fashion and apparel', icon: '👕' },
    { name: 'Home & Garden', description: 'Furniture, decor, and garden supplies', icon: '🏠' },
    { name: 'Books', description: 'Educational and leisure reading', icon: '📚' },
    { name: 'Sports', description: 'Sports equipment and gear', icon: '⚽' },
    { name: 'Beauty', description: 'Cosmetics and personal care', icon: '💄' },
    { name: 'Food & Beverages', description: 'Local food and drinks', icon: '🍔' },
    { name: 'Automotive', description: 'Car parts and accessories', icon: '🚗' },
    { name: 'Health', description: 'Healthcare and wellness products', icon: '🏥' },
    { name: 'Art & Crafts', description: 'Creative supplies and handmade items', icon: '🎨' }
  ],

  users: [
    {
      name: 'John Seller',
      email: 'john@example.com',
      password: 'password123',
      phone: '+260977123456',
      user_type: 'seller',
      shop_name: 'John\'s Electronics Store'
    },
    {
      name: 'Mary Buyer',
      email: 'mary@example.com',
      password: 'password123',
      phone: '+260977654321',
      user_type: 'buyer',
      shop_name: null
    },
    {
      name: 'David Fashion',
      email: 'david@example.com',
      password: 'password123',
      phone: '+260977555444',
      user_type: 'seller',
      shop_name: 'David\'s Fashion House'
    },
    {
      name: 'Sarah Home',
      email: 'sarah@example.com',
      password: 'password123',
      phone: '+260977777888',
      user_type: 'seller',
      shop_name: 'Sarah\'s Home & Garden'
    },
    {
      name: 'Mike Books',
      email: 'mike@example.com',
      password: 'password123',
      phone: '+260977999000',
      user_type: 'seller',
      shop_name: 'Mike\'s Bookstore'
    }
  ],

  products: [
    {
      name: 'iPhone 14 Pro',
      description: 'Latest iPhone with advanced camera system and A16 Bionic chip',
      price: 899.99,
      quantity: 10,
      category: 'Electronics',
      seller: 'john@example.com',
      image_url: '/uploads/products/iphone14.jpg',
      is_featured: true
    },
    {
      name: 'Samsung Galaxy S23',
      description: 'Flagship Android phone with excellent camera and performance',
      price: 799.99,
      quantity: 15,
      category: 'Electronics',
      seller: 'john@example.com',
      image_url: '/uploads/products/galaxy-s23.jpg',
      is_featured: true
    },
    {
      name: 'Nike Air Max 90',
      description: 'Classic Nike sneakers with Air Max cushioning',
      price: 120.00,
      quantity: 25,
      category: 'Clothing',
      seller: 'david@example.com',
      image_url: '/uploads/products/nike-air-max.jpg'
    },
    {
      name: 'Adidas Ultraboost 22',
      description: 'Premium running shoes with Boost technology',
      price: 180.00,
      quantity: 20,
      category: 'Clothing',
      seller: 'david@example.com',
      image_url: '/uploads/products/adidas-ultraboost.jpg'
    },
    {
      name: 'Wooden Coffee Table',
      description: 'Handcrafted wooden coffee table perfect for living room',
      price: 250.00,
      quantity: 5,
      category: 'Home & Garden',
      seller: 'sarah@example.com',
      image_url: '/uploads/products/coffee-table.jpg'
    },
    {
      name: 'Plant Pot Set',
      description: 'Set of 5 ceramic plant pots with drainage holes',
      price: 45.00,
      quantity: 30,
      category: 'Home & Garden',
      seller: 'sarah@example.com',
      image_url: '/uploads/products/plant-pots.jpg'
    },
    {
      name: 'Introduction to Programming',
      description: 'Comprehensive guide to learning programming fundamentals',
      price: 35.00,
      quantity: 50,
      category: 'Books',
      seller: 'mike@example.com',
      image_url: '/uploads/products/programming-book.jpg'
    },
    {
      name: 'Zambian History',
      description: 'Complete history of Zambia from pre-colonial to modern times',
      price: 28.00,
      quantity: 40,
      category: 'Books',
      seller: 'mike@example.com',
      image_url: '/uploads/products/zambian-history.jpg',
      is_featured: true
    }
  ]
};

async function seedDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('🌱 Starting database seeding...');
    
    // Clear existing data
    console.log('🗑️  Clearing existing data...');
    await client.query('DELETE FROM order_items');
    await client.query('DELETE FROM orders');
    await client.query('DELETE FROM cart_items');
    await client.query('DELETE FROM reviews');
    await client.query('DELETE FROM messages');
    await client.query('DELETE FROM notifications');
    await client.query('DELETE FROM addresses');
    await client.query('DELETE FROM payment_methods');
    await client.query('DELETE FROM products');
    await client.query('DELETE FROM users');
    await client.query('DELETE FROM categories');
    
    // Reset sequences
    await client.query('ALTER SEQUENCE categories_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE users_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE products_id_seq RESTART WITH 1');
    
    // Seed categories
    console.log('📂 Seeding categories...');
    const categoryMap = new Map();
    
    for (const category of seedData.categories) {
      const result = await client.query(
        'INSERT INTO categories (name, description, icon) VALUES ($1, $2, $3) RETURNING id',
        [category.name, category.description, category.icon]
      );
      categoryMap.set(category.name, result.rows[0].id);
    }
    
    // Seed users
    console.log('👥 Seeding users...');
    const userMap = new Map();
    
    for (const user of seedData.users) {
      const hashedPassword = await bcrypt.hash(user.password, 12);
      
      const result = await client.query(
        'INSERT INTO users (name, email, password_hash, phone, user_type, shop_name) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [user.name, user.email, hashedPassword, user.phone, user.user_type, user.shop_name]
      );
      
      userMap.set(user.email, result.rows[0].id);
      
      // Create default settings for each user
      await client.query(
        'INSERT INTO user_settings (user_id) VALUES ($1)',
        [result.rows[0].id]
      );
    }
    
    // Seed products
    console.log('📦 Seeding products...');
    for (const product of seedData.products) {
      const categoryId = categoryMap.get(product.category);
      const sellerId = userMap.get(product.seller);
      
      if (categoryId && sellerId) {
        await client.query(
          'INSERT INTO products (name, description, price, quantity, category_id, seller_id, image_url, is_featured) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
          [
            product.name,
            product.description,
            product.price,
            product.quantity,
            categoryId,
            sellerId,
            product.image_url,
            product.is_featured || false
          ]
        );
      }
    }
    
    // Seed sample addresses
    console.log('📍 Seeding sample addresses...');
    const buyerIds = Array.from(userMap.values()).filter((_, index) => 
      seedData.users[index].user_type === 'buyer'
    );
    
    for (const buyerId of buyerIds) {
      await client.query(
        `INSERT INTO addresses (
          user_id, name, address_type, full_name, phone_number,
          address_line1, city, state, zip_code, country, is_default
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          buyerId,
          'Home',
          'home',
          'John Doe',
          '+260977123456',
          '123 Main Street',
          'Lusaka',
          'Lusaka Province',
          '10101',
          'Zambia',
          true
        ]
      );
    }
    
    // Seed sample payment methods
    console.log('💳 Seeding sample payment methods...');
    for (const buyerId of buyerIds) {
      await client.query(
        `INSERT INTO payment_methods (
          user_id, payment_type, brand, last4, expiry_month, expiry_year, is_default
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [buyerId, 'credit', 'Visa', '1234', 12, 2025, true]
      );
    }
    
    // Seed sample reviews
    console.log('⭐ Seeding sample reviews...');
    const productIds = await client.query('SELECT id FROM products LIMIT 3');
    
    for (const product of productIds.rows) {
      for (const buyerId of buyerIds.slice(0, 2)) {
        await client.query(
          `INSERT INTO reviews (
            user_id, product_id, rating, title, comment, is_verified
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            buyerId,
            product.id,
            Math.floor(Math.random() * 2) + 4, // 4 or 5 stars
            'Great product!',
            'I really enjoyed this product. Good quality and fast delivery.',
            true
          ]
        );
      }
    }
    
    // Update product ratings
    console.log('📊 Updating product ratings...');
    await client.query(`
      UPDATE products 
      SET rating = (
        SELECT AVG(rating) 
        FROM reviews 
        WHERE product_id = products.id
      ),
      review_count = (
        SELECT COUNT(*) 
        FROM reviews 
        WHERE product_id = products.id
      )
      WHERE id IN (
        SELECT DISTINCT product_id FROM reviews
      )
    `);
    
    // Seed sample notifications
    console.log('🔔 Seeding sample notifications...');
    for (const userId of userMap.values()) {
      await client.query(
        `INSERT INTO notifications (
          user_id, notification_type, title, message, priority
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          userId,
          'general',
          'Welcome to Amasampo!',
          'Thank you for joining our marketplace. Start exploring amazing products from local sellers.',
          'medium'
        ]
      );
    }
    
    console.log('✅ Database seeding completed successfully!');
    console.log(`
📊 Seeded data summary:
   • Categories: ${seedData.categories.length}
   • Users: ${seedData.users.length}
   • Products: ${seedData.products.length}
   • Addresses: ${buyerIds.length}
   • Payment Methods: ${buyerIds.length}
   • Reviews: ${productIds.rows.length * 2}
   • Notifications: ${userMap.size}
`);
    
  } catch (error) {
    console.error('❌ Seeding error:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run seeding if this file is executed directly
if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log('🎉 Database seeding completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Seeding failed:', error);
      process.exit(1);
    });
}

module.exports = { seedDatabase };