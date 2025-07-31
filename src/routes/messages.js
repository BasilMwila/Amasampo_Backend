/* eslint-disable linebreak-style */
/* eslint-disable global-require */
/* eslint-disable linebreak-style */
/* eslint-disable prefer-const */
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
// routes/messages.js - Fixed with correct column names
// Alternative routes/messages.js - Works with your current DB structure
// routes/messages.js - Fixed ESLint issues for conversation-based structure
const express = require('express');
const crypto = require('crypto'); // Moved require to top
const router = express.Router();
const { dbQueries } = require('../config/database');
const { messageSchemas, validate } = require('../validation/schemas');

// @route   GET /api/messages/conversations
// @desc    Get user's conversations (adapted for conversation-based structure)
// @access  Private
router.get('/conversations', async (req, res) => {
  try {
    const userId = req.user.id;
    
    // First, try to get conversations using the conversations table
    const conversationsQuery = `
      SELECT DISTINCT
        c.id as conversation_id,
        CASE 
          WHEN c.participant1_id = $1 THEN c.participant2_id
          ELSE c.participant1_id
        END as other_user_id,
        CASE 
          WHEN c.participant1_id = $1 THEN u2.name
          ELSE u1.name
        END as other_user_name,
        CASE 
          WHEN c.participant1_id = $1 THEN u2.shop_name
          ELSE u1.shop_name
        END as other_user_shop,
        CASE 
          WHEN c.participant1_id = $1 THEN u2.avatar_url
          ELSE u1.avatar_url
        END as other_user_avatar,
        m.message_text as last_message,
        m.message_type as last_message_type,
        m.created_at as last_message_time,
        m.sender_id as last_sender_id,
        0 as unread_count
      FROM conversations c
      LEFT JOIN users u1 ON c.participant1_id = u1.id
      LEFT JOIN users u2 ON c.participant2_id = u2.id  
      LEFT JOIN LATERAL (
        SELECT message_text, message_type, created_at, sender_id
        FROM messages 
        WHERE conversation_id = c.id 
        ORDER BY created_at DESC 
        LIMIT 1
      ) m ON true
      WHERE c.participant1_id = $1 OR c.participant2_id = $1
      ORDER BY m.created_at DESC NULLS LAST
    `;

    const conversations = await dbQueries.query(conversationsQuery, [userId]);

    // Format response
    const formattedConversations = conversations.rows.map(row => ({
      other_user: {
        id: row.other_user_id,
        name: row.other_user_name,
        shop_name: row.other_user_shop,
        avatar_url: row.other_user_avatar
      },
      last_message: {
        text: row.last_message || 'No messages yet',
        type: row.last_message_type || 'text',
        time: row.last_message_time || new Date().toISOString(),
        sender_id: row.last_sender_id
      },
      unread_count: row.unread_count
    }));

    res.json({
      conversations: formattedConversations
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
// @desc    Get messages in a conversation (adapted for conversation-based structure)
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

    // Find or create conversation
    const conversation = await dbQueries.query(`
      SELECT id FROM conversations 
      WHERE (participant1_id = $1 AND participant2_id = $2) 
         OR (participant1_id = $2 AND participant2_id = $1)
      LIMIT 1
    `, [userId, otherUserId]);

    let conversationId;
    if (conversation.rows.length === 0) {
      // Create new conversation
      const newConversation = await dbQueries.query(`
        INSERT INTO conversations (participant1_id, participant2_id, created_at, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
      `, [userId, otherUserId]);
      conversationId = newConversation.rows[0].id;
    } else {
      conversationId = conversation.rows[0].id;
    }

    // Get messages for this conversation
    const messages = await dbQueries.query(`
      SELECT m.*, 
        u.name as sender_name
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = $1
      ORDER BY m.created_at DESC
      LIMIT $2 OFFSET $3
    `, [conversationId, limit, offset]);

    // Get total count
    const countResult = await dbQueries.query(`
      SELECT COUNT(*) as total
      FROM messages
      WHERE conversation_id = $1
    `, [conversationId]);

    const total = parseInt(countResult.rows[0].total);

    res.json({
      messages: messages.rows.reverse(), // Reverse to show oldest first
      other_user: {
        id: otherUser.id,
        name: otherUser.name,
        shop_name: otherUser.shop_name,
        avatar_url: otherUser.avatar_url
      },
      conversation_id: conversationId,
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
// @desc    Send a message (adapted for conversation-based structure)
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

    // Find or create conversation
    const conversation = await dbQueries.query(`
      SELECT id FROM conversations 
      WHERE (participant1_id = $1 AND participant2_id = $2) 
         OR (participant1_id = $2 AND participant2_id = $1)
      LIMIT 1
    `, [senderId, recipient_id]);

    let conversationId;
    if (conversation.rows.length === 0) {
      // Create new conversation
      const newConversation = await dbQueries.query(`
        INSERT INTO conversations (participant1_id, participant2_id, created_at, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
      `, [senderId, recipient_id]);
      conversationId = newConversation.rows[0].id;
    } else {
      conversationId = conversation.rows[0].id;
    }

    // Generate UUID for the message
    const messageUuid = crypto.randomUUID();

    // Save message
    const message = await dbQueries.query(`
      INSERT INTO messages (uuid, conversation_id, sender_id, message_text, message_type, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, 'sent', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *
    `, [messageUuid, conversationId, senderId, message_text, message_type]);

    // Update conversation timestamp
    await dbQueries.query(`
      UPDATE conversations 
      SET updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1
    `, [conversationId]);

    // Get complete message data
    const messageData = await dbQueries.query(`
      SELECT m.*, u.name as sender_name
      FROM messages m
      JOIN users u ON m.sender_id = u.id
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

    // For conversation-based system, we need to count unread messages differently
    // This is a simplified version - you might need to adjust based on your read status tracking
    const result = await dbQueries.query(`
      SELECT COUNT(*) as count 
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE (c.participant1_id = $1 OR c.participant2_id = $1) 
        AND m.sender_id != $1
        AND (m.status != 'read' OR m.status IS NULL)
    `, [userId]);

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

    // Update message status to read
    const result = await dbQueries.query(
      'UPDATE messages SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      ['read', id]
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

    // Find conversation
    const conversation = await dbQueries.query(`
      SELECT id FROM conversations 
      WHERE (participant1_id = $1 AND participant2_id = $2) 
         OR (participant1_id = $2 AND participant2_id = $1)
      LIMIT 1
    `, [userId, otherUserId]);

    if (conversation.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Conversation not found',
        code: 'CONVERSATION_NOT_FOUND'
      });
    }

    const conversationId = conversation.rows[0].id;

    // Mark all messages in conversation as read (except user's own messages)
    const result = await dbQueries.query(`
      UPDATE messages 
      SET status = 'read', updated_at = CURRENT_TIMESTAMP 
      WHERE conversation_id = $1 AND sender_id != $2 AND (status != 'read' OR status IS NULL)
    `, [conversationId, userId]);

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

    // Find or create conversation with seller
    const conversation = await dbQueries.query(`
      SELECT id FROM conversations 
      WHERE (participant1_id = $1 AND participant2_id = $2) 
         OR (participant1_id = $2 AND participant2_id = $1)
      LIMIT 1
    `, [userId, product.seller_id]);

    let conversationId;
    if (conversation.rows.length === 0) {
      // Create new conversation
      const newConversation = await dbQueries.query(`
        INSERT INTO conversations (participant1_id, participant2_id, created_at, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
      `, [userId, product.seller_id]);
      conversationId = newConversation.rows[0].id;
    } else {
      conversationId = conversation.rows[0].id;
    }

    // Generate UUID for the message
    const messageUuid = crypto.randomUUID();

    // Send message to product seller
    const message = await dbQueries.query(`
      INSERT INTO messages (uuid, conversation_id, sender_id, message_text, message_type, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, 'product', 'sent', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *
    `, [messageUuid, conversationId, userId, message_text]);

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