// routes/messages.js - Messaging routes
const express = require('express');
const router = express.Router();
const { dbQueries } = require('../config/database');
const { messageSchemas, validate } = require('../validation/schemas');

// @route   GET /api/messages/conversations
// @desc    Get user's conversations
// @access  Private
router.get('/conversations', async (req, res) => {
  try {
    const userId = req.user.id;
    
    const conversations = await dbQueries.query(`
      SELECT DISTINCT
        CASE 
          WHEN m.sender_id = $1 THEN m.recipient_id
          ELSE m.sender_id
        END as other_user_id,
        CASE 
          WHEN m.sender_id = $1 THEN u2.name
          ELSE u1.name
        END as other_user_name,
        CASE 
          WHEN m.sender_id = $1 THEN u2.shop_name
          ELSE u1.shop_name
        END as other_user_shop,
        CASE 
          WHEN m.sender_id = $1 THEN u2.avatar_url
          ELSE u1.avatar_url
        END as other_user_avatar,
        m.message_text as last_message,
        m.message_type as last_message_type,
        m.created_at as last_message_time,
        m.sender_id as last_sender_id,
        (SELECT COUNT(*) FROM messages 
         WHERE recipient_id = $1 
         AND sender_id = CASE WHEN m.sender_id = $1 THEN m.recipient_id ELSE m.sender_id END
         AND is_read = false) as unread_count
      FROM messages m
      JOIN users u1 ON m.sender_id = u1.id
      JOIN users u2 ON m.recipient_id = u2.id
      WHERE m.sender_id = $1 OR m.recipient_id = $1
      ORDER BY m.created_at DESC
    `, [userId]);

    // Group by conversation and get the latest message for each
    const conversationMap = new Map();
    
    conversations.rows.forEach(row => {
      const conversationKey = row.other_user_id;
      
      if (!conversationMap.has(conversationKey)) {
        conversationMap.set(conversationKey, {
          other_user: {
            id: row.other_user_id,
            name: row.other_user_name,
            shop_name: row.other_user_shop,
            avatar_url: row.other_user_avatar
          },
          last_message: {
            text: row.last_message,
            type: row.last_message_type,
            time: row.last_message_time,
            sender_id: row.last_sender_id
          },
          unread_count: parseInt(row.unread_count) || 0
        });
      }
    });

    res.json({
      conversations: Array.from(conversationMap.values())
    });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_CONVERSATIONS_ERROR'
    });
  }
});

// @route   GET /api/messages/conversation/:userId
// @desc    Get messages in a conversation
// @access  Private
router.get('/conversation/:userId', async (req, res) => {
  try {
    const { userId: otherUserId } = req.params;
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    // Verify other user exists
    const otherUser = await dbQueries.findUserById(otherUserId);
    if (!otherUser) {
      return res.status(404).json({ 
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    const messages = await dbQueries.query(`
      SELECT m.*, 
        u1.name as sender_name,
        u2.name as recipient_name,
        p.name as product_name,
        p.image_url as product_image
      FROM messages m
      JOIN users u1 ON m.sender_id = u1.id
      JOIN users u2 ON m.recipient_id = u2.id
      LEFT JOIN products p ON m.product_id = p.id
      WHERE (m.sender_id = $1 AND m.recipient_id = $2) 
         OR (m.sender_id = $2 AND m.recipient_id = $1)
      ORDER BY m.created_at DESC
      LIMIT $3 OFFSET $4
    `, [userId, otherUserId, limit, offset]);

    // Get total count
    const countResult = await dbQueries.query(`
      SELECT COUNT(*) as total
      FROM messages
      WHERE (sender_id = $1 AND recipient_id = $2) 
         OR (sender_id = $2 AND recipient_id = $1)
    `, [userId, otherUserId]);

    const total = parseInt(countResult.rows[0].total);

    // Mark messages as read
    await dbQueries.query(`
      UPDATE messages 
      SET is_read = true 
      WHERE sender_id = $1 AND recipient_id = $2 AND is_read = false
    `, [otherUserId, userId]);

    res.json({
      messages: messages.rows.reverse(), // Reverse to show oldest first
      other_user: {
        id: otherUser.id,
        name: otherUser.name,
        shop_name: otherUser.shop_name,
        avatar_url: otherUser.avatar_url
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
    console.error('Get conversation error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_CONVERSATION_ERROR'
    });
  }
});

// @route   POST /api/messages/send
// @desc    Send a message
// @access  Private
router.post('/send', validate(messageSchemas.send), async (req, res) => {
  try {
    const { recipient_id, message_text, message_type = 'text' } = req.validatedData;
    const senderId = req.user.id;

    // Verify recipient exists
    const recipient = await dbQueries.findUserById(recipient_id);
    if (!recipient) {
      return res.status(404).json({ 
        error: 'Recipient not found',
        code: 'RECIPIENT_NOT_FOUND'
      });
    }

    // Can't send message to self
    if (senderId === recipient_id) {
      return res.status(400).json({ 
        error: 'Cannot send message to yourself',
        code: 'CANNOT_MESSAGE_SELF'
      });
    }

    // Save message
    const message = await dbQueries.query(`
      INSERT INTO messages (sender_id, recipient_id, message_text, message_type)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [senderId, recipient_id, message_text, message_type]);

    // Get complete message data
    const messageData = await dbQueries.query(`
      SELECT m.*, 
        u1.name as sender_name,
        u2.name as recipient_name
      FROM messages m
      JOIN users u1 ON m.sender_id = u1.id
      JOIN users u2 ON m.recipient_id = u2.id
      WHERE m.id = $1
    `, [message.rows[0].id]);

    res.status(201).json({
      message: 'Message sent successfully',
      data: messageData.rows[0]
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'SEND_MESSAGE_ERROR'
    });
  }
});

// @route   GET /api/messages/unread-count
// @desc    Get unread message count
// @access  Private
router.get('/unread-count', async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await dbQueries.query(
      'SELECT COUNT(*) as count FROM messages WHERE recipient_id = $1 AND is_read = false',
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

// @route   PUT /api/messages/:id/read
// @desc    Mark message as read
// @access  Private
router.put('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await dbQueries.query(
      'UPDATE messages SET is_read = true WHERE id = $1 AND recipient_id = $2 RETURNING *',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Message not found',
        code: 'MESSAGE_NOT_FOUND'
      });
    }

    res.json({
      message: 'Message marked as read'
    });
  } catch (error) {
    console.error('Mark message read error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'MARK_MESSAGE_READ_ERROR'
    });
  }
});

// @route   PUT /api/messages/conversation/:userId/read
// @desc    Mark all messages in conversation as read
// @access  Private
router.put('/conversation/:userId/read', async (req, res) => {
  try {
    const { userId: otherUserId } = req.params;
    const userId = req.user.id;

    const result = await dbQueries.query(
      'UPDATE messages SET is_read = true WHERE sender_id = $1 AND recipient_id = $2 AND is_read = false',
      [otherUserId, userId]
    );

    res.json({
      message: 'Messages marked as read',
      updated_count: result.rowCount
    });
  } catch (error) {
    console.error('Mark conversation read error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'MARK_CONVERSATION_READ_ERROR'
    });
  }
});

// @route   DELETE /api/messages/:id
// @desc    Delete message
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Only sender can delete their message
    const result = await dbQueries.query(
      'DELETE FROM messages WHERE id = $1 AND sender_id = $2',
      [id, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ 
        error: 'Message not found or access denied',
        code: 'MESSAGE_NOT_FOUND'
      });
    }

    res.json({
      message: 'Message deleted successfully'
    });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'DELETE_MESSAGE_ERROR'
    });
  }
});

// @route   POST /api/messages/product/:productId
// @desc    Send message about a product
// @access  Private
router.post('/product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const { message_text } = req.body;
    const userId = req.user.id;

    // Get product details
    const product = await dbQueries.getProductById(productId);
    if (!product) {
      return res.status(404).json({ 
        error: 'Product not found',
        code: 'PRODUCT_NOT_FOUND'
      });
    }

    // Can't message about own product
    if (product.seller_id === userId) {
      return res.status(400).json({ 
        error: 'Cannot message about your own product',
        code: 'CANNOT_MESSAGE_OWN_PRODUCT'
      });
    }

    // Send message to product seller
    const message = await dbQueries.query(`
      INSERT INTO messages (sender_id, recipient_id, message_text, message_type, product_id)
      VALUES ($1, $2, $3, 'product', $4)
      RETURNING *
    `, [userId, product.seller_id, message_text, productId]);

    res.status(201).json({
      message: 'Message sent to seller successfully',
      data: message.rows[0]
    });
  } catch (error) {
    console.error('Send product message error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'SEND_PRODUCT_MESSAGE_ERROR'
    });
  }
});

module.exports = router;