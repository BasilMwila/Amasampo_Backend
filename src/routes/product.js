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
// routes/product.js - Product routes
const express = require('express');
const router = express.Router();
const { dbQueries } = require('../config/database');
const { 
  authenticateToken, 
  authorize, 
  checkProductOwnership,
  optionalAuth 
} = require('../middleware/auth');
const { productSchemas, validate, validateQuery } = require('../validation/schemas');

// @route   GET /api/products/featured
// @desc    Get featured products
// @access  Public
router.get('/featured', async (req, res) => {
  try {
    const limit = req.query.limit || 10;
    
    const result = await dbQueries.query(
      `SELECT p.*, c.name as category_name, u.name as seller_name, u.shop_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN users u ON p.seller_id = u.id
       WHERE p.is_active = true AND p.is_featured = true
       ORDER BY p.created_at DESC
       LIMIT $1`,
      [limit]
    );

    res.json({
      products: result.rows
    });
  } catch (error) {
    console.error('Get featured products error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_FEATURED_PRODUCTS_ERROR'
    });
  }
});

// @route   GET /api/products/seller/:sellerId
// @desc    Get products by seller
// @access  Public
router.get('/seller/:sellerId', async (req, res) => {
  try {
    const { sellerId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const result = await dbQueries.query(
      `SELECT p.*, c.name as category_name, u.name as seller_name, u.shop_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN users u ON p.seller_id = u.id
       WHERE p.seller_id = $1 AND p.is_active = true
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [sellerId, limit, offset]
    );

    // Get total count
    const countResult = await dbQueries.query(
      'SELECT COUNT(*) as total FROM products WHERE seller_id = $1 AND is_active = true',
      [sellerId]
    );
    const total = parseInt(countResult.rows[0].total);

    res.json({
      products: result.rows,
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
    console.error('Get seller products error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_SELLER_PRODUCTS_ERROR'
    });
  }
});

// @route   GET /api/products/category/:categoryId
// @desc    Get products by category
// @access  Public
router.get('/category/:categoryId', async (req, res) => {
  try {
    const { categoryId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const result = await dbQueries.query(
      `SELECT p.*, c.name as category_name, u.name as seller_name, u.shop_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN users u ON p.seller_id = u.id
       WHERE p.category_id = $1 AND p.is_active = true
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [categoryId, limit, offset]
    );

    // Get total count
    const countResult = await dbQueries.query(
      'SELECT COUNT(*) as total FROM products WHERE category_id = $1 AND is_active = true',
      [categoryId]
    );
    const total = parseInt(countResult.rows[0].total);

    res.json({
      products: result.rows,
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
    console.error('Get category products error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_CATEGORY_PRODUCTS_ERROR'
    });
  }
});

// @route   GET /api/products
// @desc    Get all products with optional filters
// @access  Public
router.get('/', validateQuery(productSchemas.search), async (req, res) => {
  try {
    const {
      search,
      category_id,
      seller_id,
      is_featured,
      min_price,
      max_price,
      sort_by = 'created_at_desc',
      page = 1,
      limit = 20
    } = req.validatedQuery;

    // Calculate offset
    const offset = (page - 1) * limit;

    // Build query
    let queryText = `
      SELECT p.*, c.name as category_name, u.name as seller_name, u.shop_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON p.seller_id = u.id
      WHERE p.is_active = true
    `;
    
    const params = [];
    let paramCount = 1;

    // Add filters
    if (search) {
      queryText += ` AND (p.name ILIKE $${paramCount} OR p.description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    if (category_id) {
      queryText += ` AND p.category_id = $${paramCount}`;
      params.push(category_id);
      paramCount++;
    }

    if (seller_id) {
      queryText += ` AND p.seller_id = $${paramCount}`;
      params.push(seller_id);
      paramCount++;
    }

    if (is_featured) {
      queryText += ` AND p.is_featured = true`;
    }

    if (min_price) {
      queryText += ` AND p.price >= $${paramCount}`;
      params.push(min_price);
      paramCount++;
    }

    if (max_price) {
      queryText += ` AND p.price <= $${paramCount}`;
      params.push(max_price);
      paramCount++;
    }

    // Add sorting
    switch (sort_by) {
      case 'price_asc':
        queryText += ' ORDER BY p.price ASC';
        break;
      case 'price_desc':
        queryText += ' ORDER BY p.price DESC';
        break;
      case 'name_asc':
        queryText += ' ORDER BY p.name ASC';
        break;
      case 'name_desc':
        queryText += ' ORDER BY p.name DESC';
        break;
      case 'created_at_asc':
        queryText += ' ORDER BY p.created_at ASC';
        break;
      default:
        queryText += ' ORDER BY p.created_at DESC';
    }

    // Add pagination
    queryText += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    // Execute query
    const result = await dbQueries.query(queryText, params);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM products p
      WHERE p.is_active = true
    `;
    
    const countParams = [];
    let countParamCount = 1;

    // Add same filters for count query
    if (search) {
      countQuery += ` AND (p.name ILIKE $${countParamCount} OR p.description ILIKE $${countParamCount})`;
      countParams.push(`%${search}%`);
      countParamCount++;
    }

    if (category_id) {
      countQuery += ` AND p.category_id = $${countParamCount}`;
      countParams.push(category_id);
      countParamCount++;
    }

    if (seller_id) {
      countQuery += ` AND p.seller_id = $${countParamCount}`;
      countParams.push(seller_id);
      countParamCount++;
    }

    if (is_featured) {
      countQuery += ` AND p.is_featured = true`;
    }

    if (min_price) {
      countQuery += ` AND p.price >= $${countParamCount}`;
      countParams.push(min_price);
      countParamCount++;
    }

    if (max_price) {
      countQuery += ` AND p.price <= $${countParamCount}`;
      countParams.push(max_price);
    }

    const countResult = await dbQueries.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      products: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
        has_next: page * limit < total,
        has_prev: page > 1
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_PRODUCTS_ERROR'
    });
  }
});

// @route   GET /api/products/:id
// @desc    Get single product
// @access  Public
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const product = await dbQueries.getProductById(id);
    
    if (!product) {
      return res.status(404).json({ 
        error: 'Product not found',
        code: 'PRODUCT_NOT_FOUND'
      });
    }

    // Increment view count
    await dbQueries.query(
      'UPDATE products SET view_count = view_count + 1 WHERE id = $1',
      [id]
    );

    // Get product reviews
    const reviewsResult = await dbQueries.query(
      `SELECT r.*, u.name as user_name
       FROM reviews r
       JOIN users u ON r.user_id = u.id
       WHERE r.product_id = $1
       ORDER BY r.created_at DESC
       LIMIT 5`,
      [id]
    );

    res.json({
      product: {
        ...product,
        view_count: product.view_count + 1
      },
      recent_reviews: reviewsResult.rows
    });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_PRODUCT_ERROR'
    });
  }
});

// @route   POST /api/products
// @desc    Create new product
// @access  Private (Sellers only)
router.post('/', authenticateToken, authorize('seller'), validate(productSchemas.create), async (req, res) => {
  try {
    const productData = {
      ...req.validatedData,
      seller_id: req.user.id
    };

    const product = await dbQueries.createProduct(productData);

    res.status(201).json({
      message: 'Product created successfully',
      product
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'CREATE_PRODUCT_ERROR'
    });
  }
});

// @route   PUT /api/products/:id
// @desc    Update product
// @access  Private (Product owner only)
router.put('/:id', authenticateToken, authorize('seller'), checkProductOwnership, validate(productSchemas.update), async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.validatedData;

    const product = await dbQueries.updateProduct(id, updateData);

    if (!product) {
      return res.status(404).json({ 
        error: 'Product not found',
        code: 'PRODUCT_NOT_FOUND'
      });
    }

    res.json({
      message: 'Product updated successfully',
      product
    });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'UPDATE_PRODUCT_ERROR'
    });
  }
});

// @route   DELETE /api/products/:id
// @desc    Delete product (soft delete)
// @access  Private (Product owner only)
router.delete('/:id', authenticateToken, authorize('seller'), checkProductOwnership, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await dbQueries.deleteProduct(id);

    if (!result) {
      return res.status(404).json({ 
        error: 'Product not found',
        code: 'PRODUCT_NOT_FOUND'
      });
    }

    res.json({
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'DELETE_PRODUCT_ERROR'
    });
  }
});

// @route   POST /api/products/:id/toggle-featured
// @desc    Toggle product featured status
// @access  Private (Product owner only)
router.post('/:id/toggle-featured', authenticateToken, authorize('seller'), checkProductOwnership, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await dbQueries.query(
      'UPDATE products SET is_featured = NOT is_featured, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING is_featured',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Product not found',
        code: 'PRODUCT_NOT_FOUND'
      });
    }

    res.json({
      message: 'Product featured status updated',
      is_featured: result.rows[0].is_featured
    });
  } catch (error) {
    console.error('Toggle featured error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'TOGGLE_FEATURED_ERROR'
    });
  }
});

// @route   POST /api/products/:id/duplicate
// @desc    Duplicate a product
// @access  Private (Product owner only)
router.post('/:id/duplicate', authenticateToken, authorize('seller'), checkProductOwnership, async (req, res) => {
  try {
    const { id } = req.params;
    const originalProduct = req.product;

    // Create duplicated product
    const duplicatedProduct = await dbQueries.query(
      `INSERT INTO products (
        seller_id, category_id, name, description, price, quantity, 
        image_url, images, is_active, is_featured, is_on_sale, original_price
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
      ) RETURNING *`,
      [
        originalProduct.seller_id,
        originalProduct.category_id,
        `${originalProduct.name} (Copy)`,
        originalProduct.description,
        originalProduct.price,
        originalProduct.quantity,
        originalProduct.image_url,
        originalProduct.images,
        originalProduct.is_active,
        false, // Don't duplicate featured status
        originalProduct.is_on_sale,
        originalProduct.original_price
      ]
    );

    res.status(201).json({
      message: 'Product duplicated successfully',
      product: duplicatedProduct.rows[0]
    });
  } catch (error) {
    console.error('Duplicate product error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'DUPLICATE_PRODUCT_ERROR'
    });
  }
});

module.exports = router;