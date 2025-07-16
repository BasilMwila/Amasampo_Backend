// routes/notifications.js - Notification routes
const express = require('express');
const router = express.Router();
const { dbQueries } = require('../config/database');

// @route   GET /api/notifications
// @desc    Get user notifications
// @access  Private
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const type = req.query.type; // filter by notification type
    const unreadOnly = req.query.unread_only === 'true';
    const offset = (page - 1) * limit;

    let queryText = `
      SELECT n.*, 
        o.order_number,
        p.name as product_name,
        p.image_url as product_image
      FROM notifications n
      LEFT JOIN orders o ON n.order_id = o.id
      LEFT JOIN products p ON n.product_id = p.id
      WHERE n.user_id = $1
    `;

    const params = [userId];
    let paramCount = 2;

    if (type) {
      queryText += ` AND n.notification_type = $${paramCount}`;
      params.push(type);
      paramCount++;
    }

    if (unreadOnly) {
      queryText += ` AND n.is_read = false`;
    }

    queryText += ` ORDER BY n.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await dbQueries.query(queryText, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM notifications WHERE user_id = $1';
    const countParams = [userId];
    let countParamCount = 2;

    if (type) {
      countQuery += ` AND notification_type = $${countParamCount}`;
      countParams.push(type);
      countParamCount++;
    }

    if (unreadOnly) {
      countQuery += ` AND is_read = false`;
    }

    const countResult = await dbQueries.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      notifications: result.rows,
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
    console.error('Get notifications error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_NOTIFICATIONS_ERROR'
    });
  }
});

// @route   GET /api/notifications/unread-count
// @desc    Get unread notification count
// @access  Private
router.get('/unread-count', async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await dbQueries.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false',
      [userId]
    );

    res.json({
      unread_count: parseInt(result.rows[0].count) || 0
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_UNREAD_COUNT_ERROR'
    });
  }
});

// @route   PUT /api/notifications/:id/read
// @desc    Mark notification as read
// @access  Private
router.put('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await dbQueries.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Notification not found',
        code: 'NOTIFICATION_NOT_FOUND'
      });
    }

    res.json({
      message: 'Notification marked as read',
      notification: result.rows[0]
    });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'MARK_NOTIFICATION_READ_ERROR'
    });
  }
});

// @route   PUT /api/notifications/mark-all-read
// @desc    Mark all notifications as read
// @access  Private
router.put('/mark-all-read', async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await dbQueries.query(
      'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
      [userId]
    );

    res.json({
      message: 'All notifications marked as read',
      updated_count: result.rowCount
    });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'MARK_ALL_NOTIFICATIONS_READ_ERROR'
    });
  }
});

// @route   DELETE /api/notifications/:id
// @desc    Delete notification
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await dbQueries.query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ 
        error: 'Notification not found',
        code: 'NOTIFICATION_NOT_FOUND'
      });
    }

    res.json({
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'DELETE_NOTIFICATION_ERROR'
    });
  }
});

// @route   DELETE /api/notifications/clear-all
// @desc    Clear all notifications
// @access  Private
router.delete('/clear-all', async (req, res) => {
  try {
    const userId = req.user.id;
    const readOnly = req.query.read_only === 'true';

    let query = 'DELETE FROM notifications WHERE user_id = $1';
    const params = [userId];

    if (readOnly) {
      query += ' AND is_read = true';
    }

    const result = await dbQueries.query(query, params);

    res.json({
      message: 'Notifications cleared successfully',
      deleted_count: result.rowCount
    });
  } catch (error) {
    console.error('Clear notifications error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'CLEAR_NOTIFICATIONS_ERROR'
    });
  }
});

// @route   GET /api/notifications/stats
// @desc    Get notification statistics
// @access  Private
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user.id;

    const stats = await dbQueries.query(`
      SELECT 
        COUNT(*) as total_notifications,
        SUM(CASE WHEN is_read = false THEN 1 ELSE 0 END) as unread_count,
        SUM(CASE WHEN notification_type = 'order' THEN 1 ELSE 0 END) as order_notifications,
        SUM(CASE WHEN notification_type = 'message' THEN 1 ELSE 0 END) as message_notifications,
        SUM(CASE WHEN notification_type = 'product' THEN 1 ELSE 0 END) as product_notifications,
        SUM(CASE WHEN priority = 'high' THEN 1 ELSE 0 END) as high_priority_count
      FROM notifications 
      WHERE user_id = $1
    `, [userId]);

    res.json({
      stats: {
        total_notifications: parseInt(stats.rows[0].total_notifications) || 0,
        unread_count: parseInt(stats.rows[0].unread_count) || 0,
        order_notifications: parseInt(stats.rows[0].order_notifications) || 0,
        message_notifications: parseInt(stats.rows[0].message_notifications) || 0,
        product_notifications: parseInt(stats.rows[0].product_notifications) || 0,
        high_priority_count: parseInt(stats.rows[0].high_priority_count) || 0
      }
    });
  } catch (error) {
    console.error('Get notification stats error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_NOTIFICATION_STATS_ERROR'
    });
  }
});

// @route   POST /api/notifications/test
// @desc    Create test notification (development only)
// @access  Private
router.post('/test', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ 
        error: 'Test notifications not allowed in production',
        code: 'TEST_NOT_ALLOWED'
      });
    }

    const userId = req.user.id;
    const { title, message, type = 'general', priority = 'medium' } = req.body;

    const notification = await dbQueries.query(`
      INSERT INTO notifications (user_id, notification_type, title, message, priority)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [userId, type, title, message, priority]);

    res.status(201).json({
      message: 'Test notification created successfully',
      notification: notification.rows[0]
    });
  } catch (error) {
    console.error('Create test notification error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'CREATE_TEST_NOTIFICATION_ERROR'
    });
  }
});

// @route   GET /api/notifications/recent
// @desc    Get recent notifications for quick access
// @access  Private
router.get('/recent', async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 5;

    const notifications = await dbQueries.query(`
      SELECT n.*, 
        o.order_number,
        p.name as product_name
      FROM notifications n
      LEFT JOIN orders o ON n.order_id = o.id
      LEFT JOIN products p ON n.product_id = p.id
      WHERE n.user_id = $1
      ORDER BY n.created_at DESC
      LIMIT $2
    `, [userId, limit]);

    res.json({
      notifications: notifications.rows
    });
  } catch (error) {
    console.error('Get recent notifications error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_RECENT_NOTIFICATIONS_ERROR'
    });
  }
});

module.exports = router;