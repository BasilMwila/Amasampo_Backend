/* eslint-disable no-unused-vars */
// routes/users.js - User management routes
const express = require('express');
const router = express.Router();
const { dbQueries } = require('../config/database');
const { authorize } = require('../middleware/auth');
const { userSchemas, validate } = require('../validation/schemas');

// @route   GET /api/users/profile
// @desc    Get user profile
// @access  Private
router.get('/profile', async (req, res) => {
  try {
    const user = await dbQueries.findUserById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ 
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json({
      user: {
        id: user.id,
        uuid: user.uuid,
        name: user.name,
        email: user.email,
        phone: user.phone,
        user_type: user.user_type,
        shop_name: user.shop_name,
        avatar_url: user.avatar_url,
        is_verified: user.is_verified,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_PROFILE_ERROR'
    });
  }
});

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', validate(userSchemas.updateProfile), async (req, res) => {
  try {
    const userId = req.user.id;
    const updateData = req.validatedData;

    const updatedUser = await dbQueries.updateUser(userId, updateData);

    if (!updatedUser) {
      return res.status(404).json({ 
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json({
      message: 'Profile updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'UPDATE_PROFILE_ERROR'
    });
  }
});

// @route   POST /api/users/upload-avatar
// @desc    Upload user avatar
// @access  Private
router.post('/upload-avatar', async (req, res) => {
  try {
    const { avatar_url } = req.body;
    const userId = req.user.id;

    if (!avatar_url) {
      return res.status(400).json({ 
        error: 'Avatar URL is required',
        code: 'AVATAR_URL_REQUIRED'
      });
    }

    const updatedUser = await dbQueries.updateUser(userId, { avatar_url });

    res.json({
      message: 'Avatar updated successfully',
      avatar_url: updatedUser.avatar_url
    });
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'UPLOAD_AVATAR_ERROR'
    });
  }
});

// @route   GET /api/users/dashboard
// @desc    Get user dashboard data
// @access  Private
router.get('/dashboard', async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.user_type;

    let dashboardData = {};

    if (userType === 'seller') {
      // Seller dashboard data
      const [orders, products, revenue] = await Promise.all([
        dbQueries.query(
          'SELECT COUNT(*) as total_orders FROM orders WHERE seller_id = $1',
          [userId]
        ),
        dbQueries.query(
          'SELECT COUNT(*) as total_products FROM products WHERE seller_id = $1 AND is_active = true',
          [userId]
        ),
        dbQueries.query(
          'SELECT SUM(total) as total_revenue FROM orders WHERE seller_id = $1 AND status = $2',
          [userId, 'delivered']
        )
      ]);

      dashboardData = {
        total_orders: parseInt(orders.rows[0].total_orders) || 0,
        total_products: parseInt(products.rows[0].total_products) || 0,
        total_revenue: parseFloat(revenue.rows[0].total_revenue) || 0
      };
    } else {
      // Buyer dashboard data
      const [orders, cartItems] = await Promise.all([
        dbQueries.query(
          'SELECT COUNT(*) as total_orders FROM orders WHERE buyer_id = $1',
          [userId]
        ),
        dbQueries.query(
          'SELECT SUM(quantity) as cart_items FROM cart_items WHERE user_id = $1',
          [userId]
        )
      ]);

      dashboardData = {
        total_orders: parseInt(orders.rows[0].total_orders) || 0,
        cart_items: parseInt(cartItems.rows[0].cart_items) || 0
      };
    }

    res.json({
      dashboard: dashboardData
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_DASHBOARD_ERROR'
    });
  }
});

// @route   GET /api/users/sellers
// @desc    Get all sellers
// @access  Public
router.get('/sellers', async (req, res) => {
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

// @route   GET /api/users/seller/:id
// @desc    Get seller details
// @access  Public
router.get('/seller/:id', async (req, res) => {
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

// @route   GET /api/users/sellers/locations
// @desc    Get sellers with location data for map
// @access  Public
router.get('/sellers/locations', async (req, res) => {
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

// @route   GET /api/users/seller/:id/profile
// @desc    Get complete seller profile with products catalog
// @access  Public
router.get('/seller/:id/profile', async (req, res) => {
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

// @route   PUT /api/users/seller/location
// @desc    Update seller location information
// @access  Private (sellers only)
router.put('/seller/location', async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.user_type;

    if (userType !== 'seller') {
      return res.status(403).json({ 
        error: 'Only sellers can update location information',
        code: 'SELLER_REQUIRED'
      });
    }

    const {
      shop_address,
      shop_city,
      shop_state,
      shop_country,
      latitude,
      longitude,
      business_hours,
      shop_description
    } = req.body;

    // Validate required fields
    if (!shop_address || !shop_city || !latitude || !longitude) {
      return res.status(400).json({ 
        error: 'Address, city, latitude, and longitude are required',
        code: 'MISSING_LOCATION_FIELDS'
      });
    }

    // Validate coordinates
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({ 
        error: 'Invalid coordinates provided',
        code: 'INVALID_COORDINATES'
      });
    }

    const updateData = {
      shop_address,
      shop_city,
      shop_state,
      shop_country: shop_country || 'Ghana',
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      business_hours: business_hours ? JSON.stringify(business_hours) : null,
      shop_description
    };

    const updatedUser = await dbQueries.updateUser(userId, updateData);

    res.json({
      message: 'Location information updated successfully',
      location: {
        shop_address: updatedUser.shop_address,
        shop_city: updatedUser.shop_city,
        shop_state: updatedUser.shop_state,
        shop_country: updatedUser.shop_country,
        latitude: parseFloat(updatedUser.latitude),
        longitude: parseFloat(updatedUser.longitude),
        business_hours: updatedUser.business_hours,
        shop_description: updatedUser.shop_description
      }
    });

  } catch (error) {
    console.error('Update seller location error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'UPDATE_SELLER_LOCATION_ERROR'
    });
  }
});

// @route   DELETE /api/users/account
// @desc    Delete user account (soft delete)
// @access  Private
router.delete('/account', async (req, res) => {
  try {
    const userId = req.user.id;

    // Soft delete user account
    await dbQueries.updateUser(userId, { is_active: false });

    res.json({
      message: 'Account deleted successfully'
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'DELETE_ACCOUNT_ERROR'
    });
  }
});

module.exports = router;