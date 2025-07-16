// routes/reviews.js - Review management routes
const express = require('express');
const router = express.Router();
const { dbQueries, transaction } = require('../config/database');
const { authenticateToken, authorize, optionalAuth } = require('../middleware/auth');
const { reviewSchemas, validate } = require('../validation/schemas');

// @route   GET /api/reviews/product/:productId
// @desc    Get reviews for a product
// @access  Public
router.get('/product/:productId', optionalAuth, async (req, res) => {
  try {
    const { productId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const rating = req.query.rating; // filter by rating
    const sortBy = req.query.sort_by || 'created_at_desc';
    const offset = (page - 1) * limit;

    // Build query
    let queryText = `
      SELECT r.*, u.name as user_name, u.avatar_url as user_avatar,
        o.order_number
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      LEFT JOIN orders o ON r.order_id = o.id
      WHERE r.product_id = $1
    `;

    const params = [productId];
    let paramCount = 2;

    if (rating) {
      queryText += ` AND r.rating = $${paramCount}`;
      params.push(rating);
      paramCount++;
    }

    // Add sorting
    switch (sortBy) {
      case 'rating_desc':
        queryText += ' ORDER BY r.rating DESC, r.created_at DESC';
        break;
      case 'rating_asc':
        queryText += ' ORDER BY r.rating ASC, r.created_at DESC';
        break;
      case 'created_at_asc':
        queryText += ' ORDER BY r.created_at ASC';
        break;
      default:
        queryText += ' ORDER BY r.created_at DESC';
    }

    queryText += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const reviews = await dbQueries.query(queryText, params);

    // Get total count and rating summary
    const [countResult, summaryResult] = await Promise.all([
      dbQueries.query(
        `SELECT COUNT(*) as total FROM reviews WHERE product_id = $1 ${rating ? 'AND rating = $2' : ''}`,
        rating ? [productId, rating] : [productId]
      ),
      dbQueries.query(
        `SELECT 
          AVG(rating) as average_rating,
          COUNT(*) as total_reviews,
          SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as five_star,
          SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as four_star,
          SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as three_star,
          SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as two_star,
          SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as one_star
         FROM reviews WHERE product_id = $1`,
        [productId]
      )
    ]);

    const total = parseInt(countResult.rows[0].total);
    const summary = summaryResult.rows[0];

    res.json({
      reviews: reviews.rows,
      rating_summary: {
        average_rating: parseFloat(summary.average_rating) || 0,
        total_reviews: parseInt(summary.total_reviews) || 0,
        five_star: parseInt(summary.five_star) || 0,
        four_star: parseInt(summary.four_star) || 0,
        three_star: parseInt(summary.three_star) || 0,
        two_star: parseInt(summary.two_star) || 0,
        one_star: parseInt(summary.one_star) || 0
      },
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
    console.error('Get product reviews error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_PRODUCT_REVIEWS_ERROR'
    });
  }
});

// @route   POST /api/reviews
// @desc    Create a new review
// @access  Private (Buyers only)
router.post('/', authenticateToken, authorize('buyer'), validate(reviewSchemas.create), async (req, res) => {
  try {
    const { product_id, rating, title, comment, order_id } = req.validatedData;
    const userId = req.user.id;

    // Check if product exists
    const product = await dbQueries.getProductById(product_id);
    if (!product) {
      return res.status(404).json({ 
        error: 'Product not found',
        code: 'PRODUCT_NOT_FOUND'
      });
    }

    // Check if user can review this product (must have purchased it)
    const orderCheck = await dbQueries.query(
      `SELECT o.id, o.status FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       WHERE o.buyer_id = $1 AND oi.product_id = $2 AND o.status = 'delivered'`,
      [userId, product_id]
    );

    if (orderCheck.rows.length === 0) {
      return res.status(403).json({ 
        error: 'You can only review products you have purchased',
        code: 'PURCHASE_REQUIRED'
      });
    }

    // Check if user has already reviewed this product
    const existingReview = await dbQueries.query(
      'SELECT id FROM reviews WHERE user_id = $1 AND product_id = $2',
      [userId, product_id]
    );

    if (existingReview.rows.length > 0) {
      return res.status(409).json({ 
        error: 'You have already reviewed this product',
        code: 'REVIEW_ALREADY_EXISTS'
      });
    }

    // Create review and update product rating
    const result = await transaction(async (client) => {
      // Insert review
      const review = await client.query(
        `INSERT INTO reviews (user_id, product_id, order_id, rating, title, comment, is_verified)
         VALUES ($1, $2, $3, $4, $5, $6, true)
         RETURNING *`,
        [userId, product_id, order_id, rating, title, comment]
      );

      // Update product rating
      const avgRating = await client.query(
        'SELECT AVG(rating) as avg_rating, COUNT(*) as review_count FROM reviews WHERE product_id = $1',
        [product_id]
      );

      await client.query(
        'UPDATE products SET rating = $1, review_count = $2 WHERE id = $3',
        [parseFloat(avgRating.rows[0].avg_rating), parseInt(avgRating.rows[0].review_count), product_id]
      );

      return review.rows[0];
    });

    // Get complete review data
    const reviewData = await dbQueries.query(
      `SELECT r.*, u.name as user_name, u.avatar_url as user_avatar
       FROM reviews r
       JOIN users u ON r.user_id = u.id
       WHERE r.id = $1`,
      [result.id]
    );

    res.status(201).json({
      message: 'Review created successfully',
      review: reviewData.rows[0]
    });
  } catch (error) {
    console.error('Create review error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'CREATE_REVIEW_ERROR'
    });
  }
});

// @route   GET /api/reviews/user/:userId
// @desc    Get reviews by user
// @access  Public
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const reviews = await dbQueries.query(
      `SELECT r.*, p.name as product_name, p.image_url as product_image
       FROM reviews r
       JOIN products p ON r.product_id = p.id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    // Get total count
    const countResult = await dbQueries.query(
      'SELECT COUNT(*) as total FROM reviews WHERE user_id = $1',
      [userId]
    );

    const total = parseInt(countResult.rows[0].total);

    res.json({
      reviews: reviews.rows,
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
    console.error('Get user reviews error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_USER_REVIEWS_ERROR'
    });
  }
});

// @route   GET /api/reviews/my-reviews
// @desc    Get current user's reviews
// @access  Private
router.get('/my-reviews', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const reviews = await dbQueries.query(
      `SELECT r.*, p.name as product_name, p.image_url as product_image,
        u.name as seller_name, u.shop_name
       FROM reviews r
       JOIN products p ON r.product_id = p.id
       JOIN users u ON p.seller_id = u.id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    // Get total count
    const countResult = await dbQueries.query(
      'SELECT COUNT(*) as total FROM reviews WHERE user_id = $1',
      [userId]
    );

    const total = parseInt(countResult.rows[0].total);

    res.json({
      reviews: reviews.rows,
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
    console.error('Get my reviews error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_MY_REVIEWS_ERROR'
    });
  }
});

// @route   PUT /api/reviews/:id
// @desc    Update a review
// @access  Private (Review owner only)
router.put('/:id', authenticateToken, validate(reviewSchemas.update), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const updateData = req.validatedData;

    // Check if review exists and belongs to user
    const existingReview = await dbQueries.query(
      'SELECT * FROM reviews WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (existingReview.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Review not found or access denied',
        code: 'REVIEW_NOT_FOUND'
      });
    }

    // Update review and product rating
    const result = await transaction(async (client) => {
      // Update review
      const fields = [];
      const values = [];
      let paramCount = 1;

      Object.entries(updateData).forEach(([key, value]) => {
        if (value !== undefined) {
          fields.push(`${key} = $${paramCount}`);
          values.push(value);
          paramCount++;
        }
      });

      if (fields.length === 0) {
        return existingReview.rows[0];
      }

      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);

      const updatedReview = await client.query(
        `UPDATE reviews SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );

      // Update product rating if rating was changed
      if (updateData.rating) {
        const avgRating = await client.query(
          'SELECT AVG(rating) as avg_rating, COUNT(*) as review_count FROM reviews WHERE product_id = $1',
          [existingReview.rows[0].product_id]
        );

        await client.query(
          'UPDATE products SET rating = $1, review_count = $2 WHERE id = $3',
          [parseFloat(avgRating.rows[0].avg_rating), parseInt(avgRating.rows[0].review_count), existingReview.rows[0].product_id]
        );
      }

      return updatedReview.rows[0];
    });

    res.json({
      message: 'Review updated successfully',
      review: result
    });
  } catch (error) {
    console.error('Update review error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'UPDATE_REVIEW_ERROR'
    });
  }
});

// @route   DELETE /api/reviews/:id
// @desc    Delete a review
// @access  Private (Review owner only)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if review exists and belongs to user
    const existingReview = await dbQueries.query(
      'SELECT * FROM reviews WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (existingReview.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Review not found or access denied',
        code: 'REVIEW_NOT_FOUND'
      });
    }

    // Delete review and update product rating
    await transaction(async (client) => {
      // Delete review
      await client.query('DELETE FROM reviews WHERE id = $1', [id]);

      // Update product rating
      const avgRating = await client.query(
        'SELECT AVG(rating) as avg_rating, COUNT(*) as review_count FROM reviews WHERE product_id = $1',
        [existingReview.rows[0].product_id]
      );

      await client.query(
        'UPDATE products SET rating = $1, review_count = $2 WHERE id = $3',
        [parseFloat(avgRating.rows[0].avg_rating) || 0, parseInt(avgRating.rows[0].review_count) || 0, existingReview.rows[0].product_id]
      );
    });

    res.json({
      message: 'Review deleted successfully'
    });
  } catch (error) {
    console.error('Delete review error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'DELETE_REVIEW_ERROR'
    });
  }
});

// @route   GET /api/reviews/can-review/:productId
// @desc    Check if user can review a product
// @access  Private
router.get('/can-review/:productId', authenticateToken, async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user.id;

    // Check if user has purchased the product
    const orderCheck = await dbQueries.query(
      `SELECT o.id FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       WHERE o.buyer_id = $1 AND oi.product_id = $2 AND o.status = 'delivered'`,
      [userId, productId]
    );

    if (orderCheck.rows.length === 0) {
      return res.json({
        can_review: false,
        reason: 'You must purchase this product to review it'
      });
    }

    // Check if user has already reviewed this product
    const existingReview = await dbQueries.query(
      'SELECT id FROM reviews WHERE user_id = $1 AND product_id = $2',
      [userId, productId]
    );

    if (existingReview.rows.length > 0) {
      return res.json({
        can_review: false,
        reason: 'You have already reviewed this product'
      });
    }

    res.json({
      can_review: true
    });
  } catch (error) {
    console.error('Check can review error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'CHECK_CAN_REVIEW_ERROR'
    });
  }
});

// @route   POST /api/reviews/:id/helpful
// @desc    Mark review as helpful
// @access  Private
router.post('/:id/helpful', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if review exists
    const review = await dbQueries.query(
      'SELECT * FROM reviews WHERE id = $1',
      [id]
    );

    if (review.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Review not found',
        code: 'REVIEW_NOT_FOUND'
      });
    }

    // Check if user has already marked as helpful
    const existingHelpful = await dbQueries.query(
      'SELECT id FROM review_helpful WHERE review_id = $1 AND user_id = $2',
      [id, userId]
    );

    if (existingHelpful.rows.length > 0) {
      return res.status(409).json({ 
        error: 'You have already marked this review as helpful',
        code: 'ALREADY_MARKED_HELPFUL'
      });
    }

    // Mark as helpful
    await dbQueries.query(
      'INSERT INTO review_helpful (review_id, user_id) VALUES ($1, $2)',
      [id, userId]
    );

    res.json({
      message: 'Review marked as helpful'
    });
  } catch (error) {
    console.error('Mark review helpful error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'MARK_REVIEW_HELPFUL_ERROR'
    });
  }
});

// @route   GET /api/reviews/stats/seller
// @desc    Get review statistics for seller
// @access  Private (Sellers only)
router.get('/stats/seller', authenticateToken, authorize('seller'), async (req, res) => {
  try {
    const userId = req.user.id;

    const stats = await dbQueries.query(
      `SELECT 
        COUNT(r.*) as total_reviews,
        AVG(r.rating) as average_rating,
        SUM(CASE WHEN r.rating = 5 THEN 1 ELSE 0 END) as five_star_reviews,
        SUM(CASE WHEN r.rating = 4 THEN 1 ELSE 0 END) as four_star_reviews,
        SUM(CASE WHEN r.rating = 3 THEN 1 ELSE 0 END) as three_star_reviews,
        SUM(CASE WHEN r.rating = 2 THEN 1 ELSE 0 END) as two_star_reviews,
        SUM(CASE WHEN r.rating = 1 THEN 1 ELSE 0 END) as one_star_reviews
       FROM reviews r
       JOIN products p ON r.product_id = p.id
       WHERE p.seller_id = $1`,
      [userId]
    );

    res.json({
      stats: {
        total_reviews: parseInt(stats.rows[0].total_reviews) || 0,
        average_rating: parseFloat(stats.rows[0].average_rating) || 0,
        five_star_reviews: parseInt(stats.rows[0].five_star_reviews) || 0,
        four_star_reviews: parseInt(stats.rows[0].four_star_reviews) || 0,
        three_star_reviews: parseInt(stats.rows[0].three_star_reviews) || 0,
        two_star_reviews: parseInt(stats.rows[0].two_star_reviews) || 0,
        one_star_reviews: parseInt(stats.rows[0].one_star_reviews) || 0
      }
    });
  } catch (error) {
    console.error('Get seller review stats error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_SELLER_REVIEW_STATS_ERROR'
    });
  }
});

module.exports = router;