// routes/public-sellers.js - Public seller routes that don't require authentication
const express = require('express');
const router = express.Router();
const { dbQueries } = require('../config/database');

console.log('🔍 Public sellers routes loaded!');

// Debug test route - this works
router.get('/test', (req, res) => {
  console.log('🔍 Test route hit!');
  res.json({ message: 'Public sellers routes are working!' });
});

// Add sample locations endpoint - temporary for testing
router.post('/add-sample-locations', async (req, res) => {
  try {
    console.log('🗺️ Adding sample seller locations...');

    // Get existing sellers
    const sellersResult = await dbQueries.query(
      'SELECT id, name, shop_name FROM users WHERE user_type = \'seller\' LIMIT 10'
    );

    if (sellersResult.rows.length === 0) {
      return res.json({ message: 'No sellers found', sellers_updated: 0 });
    }

    // Sample locations in Ghana
    const locations = [
      {
        address: '123 Oxford Street, Osu',
        city: 'Accra',
        state: 'Greater Accra',
        country: 'Ghana',
        latitude: 5.5557,
        longitude: -0.1963,
        description: 'Electronics and gadgets store in the heart of Osu'
      },
      {
        address: '456 Kwame Nkrumah Avenue',
        city: 'Accra',
        state: 'Greater Accra', 
        country: 'Ghana',
        latitude: 5.5692,
        longitude: -0.1967,
        description: 'Fashion and clothing boutique'
      }
    ];

    let updated = 0;
    for (let i = 0; i < sellersResult.rows.length && i < locations.length; i++) {
      const seller = sellersResult.rows[i];
      const location = locations[i];

      const business_hours = {
        monday: { open: '08:00', close: '18:00', closed: false },
        tuesday: { open: '08:00', close: '18:00', closed: false },
        wednesday: { open: '08:00', close: '18:00', closed: false },
        thursday: { open: '08:00', close: '18:00', closed: false },
        friday: { open: '08:00', close: '18:00', closed: false },
        saturday: { open: '09:00', close: '16:00', closed: false },
        sunday: { open: '10:00', close: '14:00', closed: false }
      };

      await dbQueries.query(
        `UPDATE users SET 
           shop_address = $1,
           shop_city = $2,
           shop_state = $3,
           shop_country = $4,
           latitude = $5,
           longitude = $6,
           business_hours = $7,
           shop_description = $8,
           updated_at = NOW()
         WHERE id = $9`,
        [
          location.address,
          location.city,
          location.state,
          location.country,
          location.latitude,
          location.longitude,
          JSON.stringify(business_hours),
          location.description,
          seller.id
        ]
      );
      updated++;
    }

    res.json({ 
      message: `Successfully added locations to ${updated} sellers!`, 
      sellers_updated: updated 
    });
  } catch (error) {
    console.error('Add sample locations error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'ADD_SAMPLE_LOCATIONS_ERROR'
    });
  }
});

// CRITICAL: All specific string routes MUST be defined before any parameterized routes (:id)
// This is how Express routing works - first match wins

// @route   GET /api/sellers/locations
// @desc    Get sellers with location data for map
// @access  Public
router.get('/locations', async (req, res) => {
  console.log('🗺️ Locations route hit!');
  try {
    const { city, state, country, bounds } = req.query;

    let queryText = `
      SELECT id, name, shop_name, shop_address, shop_city, shop_state, shop_country,
             latitude, longitude, avatar_url, business_hours, shop_description,
             (SELECT COUNT(*) FROM products WHERE seller_id = users.id AND is_active = true) as product_count,
             (SELECT AVG(rating) FROM reviews r 
              JOIN products p ON r.product_id = p.id 
              WHERE p.seller_id = users.id) as average_rating
      FROM users 
      WHERE user_type = 'seller' AND is_active = true 
        AND latitude IS NOT NULL AND longitude IS NOT NULL
    `;
    
    const params = [];
    let paramCount = 1;

    // Filter by city if provided
    if (city) {
      queryText += ` AND shop_city ILIKE $${paramCount}`;
      params.push(`%${city}%`);
      paramCount++;
    }

    // Filter by state if provided
    if (state) {
      queryText += ` AND shop_state ILIKE $${paramCount}`;
      params.push(`%${state}%`);
      paramCount++;
    }

    // Filter by country if provided
    if (country) {
      queryText += ` AND shop_country ILIKE $${paramCount}`;
      params.push(`%${country}%`);
      paramCount++;
    }

    // Filter by map bounds if provided (southwest and northeast coordinates)
    if (bounds) {
      try {
        const { swLat, swLng, neLat, neLng } = JSON.parse(bounds);
        queryText += ` AND latitude BETWEEN $${paramCount} AND $${paramCount + 1}`;
        queryText += ` AND longitude BETWEEN $${paramCount + 2} AND $${paramCount + 3}`;
        params.push(swLat, neLat, swLng, neLng);
        paramCount += 4;
      } catch (error) {
        console.warn('Invalid bounds parameter:', bounds);
      }
    }

    queryText += ' ORDER BY product_count DESC, created_at DESC';

    const result = await dbQueries.query(queryText, params);

    // Process the results
    const sellers = result.rows.map(seller => ({
      ...seller,
      latitude: parseFloat(seller.latitude),
      longitude: parseFloat(seller.longitude),
      product_count: parseInt(seller.product_count) || 0,
      average_rating: parseFloat(seller.average_rating) || 0,
      business_hours: seller.business_hours || null
    }));

    res.json({
      sellers,
      total: sellers.length
    });
  } catch (error) {
    console.error('Get sellers locations error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_SELLERS_LOCATIONS_ERROR'
    });
  }
});

// @route   GET /api/sellers/
// @desc    Get all sellers
// @access  Public
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search;
    const offset = (page - 1) * limit;

    let queryText = `
      SELECT id, name, shop_name, avatar_url, created_at,
        (SELECT COUNT(*) FROM products WHERE seller_id = users.id AND is_active = true) as product_count
      FROM users 
      WHERE user_type = 'seller' AND is_active = true
    `;
    
    const params = [];
    let paramCount = 1;

    if (search) {
      queryText += ` AND (name ILIKE $${paramCount} OR shop_name ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    queryText += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await dbQueries.query(queryText, params);

    // Get total count
    let countQuery = "SELECT COUNT(*) as total FROM users WHERE user_type = 'seller' AND is_active = true";
    const countParams = [];

    if (search) {
      countQuery += ' AND (name ILIKE $1 OR shop_name ILIKE $1)';
      countParams.push(`%${search}%`);
    }

    const countResult = await dbQueries.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      sellers: result.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        has_next: page * limit < total,
        has_prev: page > 1
      }
    });
  } catch (error) {
    console.error('Get sellers error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_SELLERS_ERROR'
    });
  }
});

// @route   GET /api/sellers/:id
// @desc    Get seller details
// @access  Public
router.get('/:id', async (req, res) => {
  console.log(`🔍 Seller details route hit with ID: ${req.params.id}`);
  try {
    const { id } = req.params;

    const seller = await dbQueries.query(
      `SELECT id, name, shop_name, avatar_url, created_at, phone,
        (SELECT COUNT(*) FROM products WHERE seller_id = users.id AND is_active = true) as product_count,
        (SELECT AVG(rating) FROM reviews r 
         JOIN products p ON r.product_id = p.id 
         WHERE p.seller_id = users.id) as average_rating
       FROM users 
       WHERE id = $1 AND user_type = 'seller' AND is_active = true`,
      [id]
    );

    if (seller.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Seller not found',
        code: 'SELLER_NOT_FOUND'
      });
    }

    // Get seller's recent products
    const products = await dbQueries.query(
      `SELECT id, name, price, image_url, created_at
       FROM products 
       WHERE seller_id = $1 AND is_active = true
       ORDER BY created_at DESC
       LIMIT 6`,
      [id]
    );

    res.json({
      seller: {
        ...seller.rows[0],
        average_rating: parseFloat(seller.rows[0].average_rating) || 0
      },
      recent_products: products.rows
    });
  } catch (error) {
    console.error('Get seller details error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_SELLER_DETAILS_ERROR'
    });
  }
});

// @route   GET /api/sellers/:id/profile
// @desc    Get complete seller profile with products catalog
// @access  Public
router.get('/:id/profile', async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const category = req.query.category;
    const sort = req.query.sort || 'newest'; // newest, price_low, price_high, popular
    const offset = (page - 1) * limit;

    // Get seller profile with location data
    const sellerQuery = await dbQueries.query(
      `SELECT id, name, shop_name, shop_address, shop_city, shop_state, shop_country,
              latitude, longitude, avatar_url, business_hours, shop_description, 
              phone, created_at,
              (SELECT COUNT(*) FROM products WHERE seller_id = users.id AND is_active = true) as product_count,
              (SELECT AVG(rating) FROM reviews r 
               JOIN products p ON r.product_id = p.id 
               WHERE p.seller_id = users.id) as average_rating,
              (SELECT COUNT(*) FROM orders WHERE seller_id = users.id) as total_orders
       FROM users 
       WHERE id = $1 AND user_type = 'seller' AND is_active = true`,
      [id]
    );

    if (sellerQuery.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Seller not found',
        code: 'SELLER_NOT_FOUND'
      });
    }

    const seller = {
      ...sellerQuery.rows[0],
      latitude: sellerQuery.rows[0].latitude ? parseFloat(sellerQuery.rows[0].latitude) : null,
      longitude: sellerQuery.rows[0].longitude ? parseFloat(sellerQuery.rows[0].longitude) : null,
      product_count: parseInt(sellerQuery.rows[0].product_count) || 0,
      average_rating: parseFloat(sellerQuery.rows[0].average_rating) || 0,
      total_orders: parseInt(sellerQuery.rows[0].total_orders) || 0,
      business_hours: sellerQuery.rows[0].business_hours || null
    };

    // Build products query
    let productsQueryText = `
      SELECT p.*, c.name as category_name,
             (SELECT AVG(rating) FROM reviews WHERE product_id = p.id) as rating,
             (SELECT COUNT(*) FROM reviews WHERE product_id = p.id) as review_count
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.seller_id = $1 AND p.is_active = true
    `;
    
    const productsParams = [id];
    let productsParamCount = 2;

    // Filter by category if provided
    if (category && category !== 'all') {
      productsQueryText += ` AND c.name ILIKE $${productsParamCount}`;
      productsParams.push(`%${category}%`);
      productsParamCount++;
    }

    // Add sorting
    switch (sort) {
      case 'price_low':
        productsQueryText += ' ORDER BY p.price ASC';
        break;
      case 'price_high':
        productsQueryText += ' ORDER BY p.price DESC';
        break;
      case 'popular':
        productsQueryText += ' ORDER BY p.view_count DESC, p.created_at DESC';
        break;
      case 'rating':
        productsQueryText += ' ORDER BY (SELECT AVG(rating) FROM reviews WHERE product_id = p.id) DESC NULLS LAST';
        break;
      default: // newest
        productsQueryText += ' ORDER BY p.created_at DESC';
    }

    productsQueryText += ` LIMIT $${productsParamCount} OFFSET $${productsParamCount + 1}`;
    productsParams.push(limit, offset);

    const productsResult = await dbQueries.query(productsQueryText, productsParams);

    // Get total products count
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.seller_id = $1 AND p.is_active = true
    `;
    const countParams = [id];

    if (category && category !== 'all') {
      countQuery += ' AND c.name ILIKE $2';
      countParams.push(`%${category}%`);
    }

    const countResult = await dbQueries.query(countQuery, countParams);
    const totalProducts = parseInt(countResult.rows[0].total);

    // Get product categories for this seller
    const categoriesResult = await dbQueries.query(
      `SELECT DISTINCT c.id, c.name, COUNT(p.id) as product_count
       FROM categories c
       JOIN products p ON c.id = p.category_id
       WHERE p.seller_id = $1 AND p.is_active = true
       GROUP BY c.id, c.name
       ORDER BY product_count DESC, c.name ASC`,
      [id]
    );

    // Process products with proper price conversion
    const products = productsResult.rows.map(product => ({
      ...product,
      price: parseFloat(product.price) || 0,
      original_price: product.original_price ? parseFloat(product.original_price) : null,
      rating: parseFloat(product.rating) || 0,
      review_count: parseInt(product.review_count) || 0
    }));

    res.json({
      seller,
      products,
      categories: categoriesResult.rows.map(cat => ({
        ...cat,
        product_count: parseInt(cat.product_count)
      })),
      pagination: {
        page,
        limit,
        total: totalProducts,
        pages: Math.ceil(totalProducts / limit),
        has_next: page * limit < totalProducts,
        has_prev: page > 1
      }
    });

  } catch (error) {
    console.error('Get seller profile error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_SELLER_PROFILE_ERROR'
    });
  }
});

module.exports = router;