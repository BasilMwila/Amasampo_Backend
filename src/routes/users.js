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