// routes/notifications.js - Notification routes with push notification support
const express = require('express');
const router = express.Router();
const { dbQueries, transaction } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { Expo } = require('expo-server-sdk');

// Initialize Expo SDK for push notifications
const expo = new Expo({
  useFcmV1: false, // Set to true if you want to use FCM v1 API
});

// @route   GET /api/notifications
// @desc    Get user notifications
// @access  Private
router.get('/', authenticateToken, async (req, res) => {
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
router.get('/unread-count', authenticateToken, async (req, res) => {
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
router.put('/:id/read', authenticateToken, async (req, res) => {
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
router.put('/mark-all-read', authenticateToken, async (req, res) => {
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
router.delete('/:id', authenticateToken, async (req, res) => {
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
router.delete('/clear-all', authenticateToken, async (req, res) => {
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
router.get('/stats', authenticateToken, async (req, res) => {
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
router.post('/test', authenticateToken, async (req, res) => {
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
router.get('/recent', authenticateToken, async (req, res) => {
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

// @route   POST /api/notifications/register-token
// @desc    Register push notification token for user
// @access  Private
router.post('/register-token', authenticateToken, async (req, res) => {
  try {
    const { pushToken, deviceType, deviceId } = req.body;
    const userId = req.user.id;

    if (!pushToken) {
      return res.status(400).json({
        error: 'Push token is required',
        code: 'PUSH_TOKEN_REQUIRED'
      });
    }

    // Validate the push token
    if (!Expo.isExpoPushToken(pushToken)) {
      return res.status(400).json({
        error: 'Invalid Expo push token',
        code: 'INVALID_PUSH_TOKEN'
      });
    }

    // Store or update push token
    await dbQueries.query(`
      INSERT INTO user_push_tokens (user_id, push_token, device_type, device_id, is_active)
      VALUES ($1, $2, $3, $4, true)
      ON CONFLICT (user_id, device_id) 
      DO UPDATE SET 
        push_token = $2,
        device_type = $3,
        is_active = true,
        updated_at = CURRENT_TIMESTAMP
    `, [userId, pushToken, deviceType || 'unknown', deviceId || 'default']);

    console.log(`✅ Push token registered for user ${userId}:`, pushToken);

    res.json({
      message: 'Push token registered successfully',
      success: true
    });
  } catch (error) {
    console.error('Register push token error:', error);
    res.status(500).json({
      error: 'Internal server error',
      code: 'REGISTER_PUSH_TOKEN_ERROR'
    });
  }
});

// @route   POST /api/notifications/send-push
// @desc    Send push notification to specific users
// @access  Private
router.post('/send-push', authenticateToken, async (req, res) => {
  try {
    const { userIds, title, body, data = {} } = req.body;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        error: 'User IDs array is required',
        code: 'USER_IDS_REQUIRED'
      });
    }

    if (!title || !body) {
      return res.status(400).json({
        error: 'Title and body are required',
        code: 'TITLE_BODY_REQUIRED'
      });
    }

    const results = await sendPushNotifications(userIds, {
      title,
      body,
      data
    });

    res.json({
      message: 'Push notifications sent',
      results,
      success: true
    });
  } catch (error) {
    console.error('Send push notification error:', error);
    res.status(500).json({
      error: 'Internal server error',
      code: 'SEND_PUSH_NOTIFICATION_ERROR'
    });
  }
});

// Helper function to send push notifications to multiple users
async function sendPushNotifications(userIds, notificationData) {
  try {
    // Get push tokens for users
    const tokens = await dbQueries.query(`
      SELECT user_id, push_token 
      FROM user_push_tokens 
      WHERE user_id = ANY($1) AND is_active = true
    `, [userIds]);

    if (tokens.rows.length === 0) {
      console.log('⚠️ No active push tokens found for users:', userIds);
      return { success: false, message: 'No active push tokens found' };
    }

    // Create push messages
    const messages = tokens.rows
      .filter(row => Expo.isExpoPushToken(row.push_token))
      .map(row => ({
        to: row.push_token,
        sound: 'default',
        title: notificationData.title,
        body: notificationData.body,
        data: {
          ...notificationData.data,
          userId: row.user_id
        },
      }));

    if (messages.length === 0) {
      console.log('⚠️ No valid push tokens found for users:', userIds);
      return { success: false, message: 'No valid push tokens found' };
    }

    // Send notifications in chunks
    const chunks = expo.chunkPushNotifications(messages);
    const results = [];

    for (const chunk of chunks) {
      try {
        const tickets = await expo.sendPushNotificationsAsync(chunk);
        results.push(...tickets);
        console.log('📨 Push notification tickets:', tickets);
      } catch (error) {
        console.error('❌ Error sending push notification chunk:', error);
        results.push({ status: 'error', message: error.message });
      }
    }

    return {
      success: true,
      message: `Sent ${messages.length} push notifications`,
      results,
      sent_count: messages.length
    };
  } catch (error) {
    console.error('❌ Send push notifications helper error:', error);
    throw error;
  }
}

// Helper function to send order notification
async function sendOrderNotification(orderUpdate) {
  try {
    const { orderId, buyerId, sellerId, status, orderNumber } = orderUpdate;
    
    // Determine notification recipients and message
    let recipientId, title, body;
    
    switch (status) {
      case 'confirmed':
        recipientId = buyerId;
        title = 'Order Confirmed! 🎉';
        body = `Your order ${orderNumber} has been confirmed by the seller`;
        break;
      case 'preparing':
        recipientId = buyerId;
        title = 'Order Being Prepared 👨‍🍳';
        body = `Your order ${orderNumber} is being prepared`;
        break;
      case 'ready':
        recipientId = buyerId;
        title = 'Order Ready! ✅';
        body = `Your order ${orderNumber} is ready for pickup/delivery`;
        break;
      case 'out_for_delivery':
        recipientId = buyerId;
        title = 'Out for Delivery 🚚';
        body = `Your order ${orderNumber} is out for delivery`;
        break;
      case 'delivered':
        recipientId = buyerId;
        title = 'Order Delivered! 📦';
        body = `Your order ${orderNumber} has been delivered`;
        break;
      case 'cancelled':
        recipientId = buyerId;
        title = 'Order Cancelled ❌';
        body = `Order ${orderNumber} has been cancelled`;
        break;
      default:
        return { success: false, message: 'Unknown order status' };
    }

    // Send push notification
    const result = await sendPushNotifications([recipientId], {
      title,
      body,
      data: {
        type: 'order',
        orderId,
        orderNumber,
        status
      }
    });

    console.log(`📱 Order notification sent for ${orderNumber}:`, result);
    return result;
  } catch (error) {
    console.error('❌ Send order notification error:', error);
    throw error;
  }
}

// Helper function to send message notification
async function sendMessageNotification(messageData) {
  try {
    const { recipientId, senderName, message, senderId } = messageData;
    
    const result = await sendPushNotifications([recipientId], {
      title: `New message from ${senderName}`,
      body: message,
      data: {
        type: 'message',
        senderId,
        senderName
      }
    });

    console.log(`📱 Message notification sent to ${recipientId}:`, result);
    return result;
  } catch (error) {
    console.error('❌ Send message notification error:', error);
    throw error;
  }
}

// Export helper functions for use in other routes
module.exports = router;
module.exports.sendPushNotifications = sendPushNotifications;
module.exports.sendOrderNotification = sendOrderNotification;
module.exports.sendMessageNotification = sendMessageNotification;