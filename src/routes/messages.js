/* eslint-disable linebreak-style */
/* eslint-disable prefer-destructuring */
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

// routes/messages.js - COMPLETE FIXED VERSION WITH DATABASE DEBUGGING
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { dbQueries } = require('../config/database');

// Simple validation middleware (since validation/schemas might not exist)
const validateSendMessage = (req, res, next) => {
  const { recipient_id, message_text } = req.body;
  
  if (!recipient_id || !message_text) {
    return res.status(400).json({
      error: 'recipient_id and message_text are required',
      code: 'VALIDATION_ERROR'
    });
  }
  
  if (typeof recipient_id !== 'number' && isNaN(Number(recipient_id))) {
    return res.status(400).json({
      error: 'recipient_id must be a valid number',
      code: 'VALIDATION_ERROR'
    });
  }
  
  if (typeof message_text !== 'string' || message_text.trim().length === 0) {
    return res.status(400).json({
      error: 'message_text must be a non-empty string',
      code: 'VALIDATION_ERROR'
    });
  }
  
  // Add validated data to request
  req.validatedData = {
    recipient_id: Number(recipient_id),
    message_text: message_text.trim(),
    message_type: req.body.message_type || 'text'
  };
  
  next();
};

// TEST ROUTE - Remove this after testing
router.get('/test', (req, res) => {
  console.log('🧪 TEST ROUTE HIT - Messages routes are working');
  res.json({ 
    message: 'Messages routes are working', 
    user: req.user?.id,
    timestamp: new Date().toISOString()
  });
});

// @route   GET /api/messages/conversations
// @desc    Get user's conversations (fixed for user1_id/user2_id structure)
// @access  Private
router.get('/conversations', async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('💬 Getting conversations for user:', userId);
    
    // Fixed query to use user1_id/user2_id instead of participant1_id/participant2_id
    const conversationsQuery = `
      SELECT DISTINCT
        c.id as conversation_id,
        CASE 
          WHEN c.user1_id = $1 THEN c.user2_id
          ELSE c.user1_id
        END as other_user_id,
        CASE 
          WHEN c.user1_id = $1 THEN u2.name
          ELSE u1.name
        END as other_user_name,
        CASE 
          WHEN c.user1_id = $1 THEN u2.shop_name
          ELSE u1.shop_name
        END as other_user_shop,
        CASE 
          WHEN c.user1_id = $1 THEN u2.avatar_url
          ELSE u1.avatar_url
        END as other_user_avatar,
        m.message_text as last_message,
        m.message_type as last_message_type,
        m.created_at as last_message_time,
        m.sender_id as last_sender_id,
        0 as unread_count
      FROM conversations c
      LEFT JOIN users u1 ON c.user1_id = u1.id
      LEFT JOIN users u2 ON c.user2_id = u2.id  
      LEFT JOIN LATERAL (
        SELECT message_text, message_type, created_at, sender_id
        FROM messages 
        WHERE conversation_id = c.id 
        ORDER BY created_at DESC 
        LIMIT 1
      ) m ON true
      WHERE c.user1_id = $1 OR c.user2_id = $1
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

    console.log(`✅ Found ${formattedConversations.length} conversations`);
    res.json({
      conversations: formattedConversations
    });
  } catch (error) {
    console.error('❌ Get conversations error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_CONVERSATIONS_ERROR'
    });
  }
});

// @route   GET /api/messages/unread-count
// @desc    Get unread message count
// @access  Private
router.get('/unread-count', async (req, res) => {
  try {
    const userId = req.user.id;

    // Count unread messages where user is the receiver
    const result = await dbQueries.query(`
      SELECT COUNT(*) as count 
      FROM messages m
      WHERE m.receiver_id = $1 
        AND (m.is_read = false OR m.is_read IS NULL)
    `, [userId]);

    res.json({
      unread_count: parseInt(result.rows[0].count) || 0
    });
  } catch (error) {
    console.error('❌ Get unread count error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_UNREAD_COUNT_ERROR'
    });
  }
});

// @route   POST /api/messages/product/:productId
// @desc    Send message about a product - COMPLETE DEBUG VERSION
// @access  Private
router.post('/product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const { message_text } = req.body;
    const userId = req.user.id;

    console.log('🚀 ROUTE HIT: POST /api/messages/product/' + productId);
    console.log('📝 Request body:', req.body);
    console.log('👤 User ID:', userId);

    // Basic validation
    if (!productId || isNaN(productId)) {
      console.log('❌ Invalid product ID:', productId);
      return res.status(400).json({ 
        error: 'Invalid product ID',
        code: 'INVALID_PRODUCT_ID'
      });
    }

    if (!userId) {
      console.log('❌ No user ID found');
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    console.log(`💬 Sending product message for product ${productId} from user ${userId}`);

    // Get product details
    let product;
    try {
      product = await dbQueries.getProductById(productId);
      console.log('📦 Product query result:', product ? 'FOUND' : 'NOT FOUND');
      if (product) {
        console.log('✅ Product details:', {
          id: product.id,
          name: product.name,
          seller_id: product.seller_id,
          seller_name: product.seller_name
        });
      }
    } catch (dbError) {
      console.error('❌ Database error getting product:', dbError);
      return res.status(500).json({
        error: 'Database error',
        code: 'DATABASE_ERROR'
      });
    }
    
    if (!product) {
      console.log('❌ Product not found for ID:', productId);
      return res.status(404).json({ 
        error: 'Product not found',
        code: 'PRODUCT_NOT_FOUND'
      });
    }

    // Can't message about own product
    if (product.seller_id === userId) {
      console.log('❌ User trying to message about own product');
      return res.status(400).json({ 
        error: 'Cannot message about your own product',
        code: 'CANNOT_MESSAGE_OWN_PRODUCT'
      });
    }

    // Check if seller exists
    let seller;
    try {
      seller = await dbQueries.findUserById(product.seller_id);
      if (!seller) {
        console.log('❌ Seller not found for ID:', product.seller_id);
        return res.status(404).json({
          error: 'Seller not found',
          code: 'SELLER_NOT_FOUND'
        });
      }
      console.log('✅ Seller found:', seller.name);
    } catch (dbError) {
      console.error('❌ Error finding seller:', dbError);
      return res.status(500).json({
        error: 'Database error finding seller',
        code: 'DATABASE_ERROR'
      });
    }

    // STEP 1: Check what columns exist in your messages table
    console.log('🔍 Checking messages table structure...');
    try {
      const tableStructure = await dbQueries.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'messages'
        ORDER BY ordinal_position
      `);
      
      console.log('📋 Messages table columns:');
      const columnNames = [];
      tableStructure.rows.forEach(col => {
        columnNames.push(col.column_name);
        console.log(`  - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'} ${col.column_default ? `DEFAULT: ${col.column_default}` : ''}`);
      });
      
      console.log('📝 Available columns:', columnNames.join(', '));
    } catch (error) {
      console.error('❌ Error checking table structure:', error);
    }

    // Find or create conversation using user1_id/user2_id
    let conversation;
    try {
      conversation = await dbQueries.query(`
        SELECT id FROM conversations 
        WHERE (user1_id = $1 AND user2_id = $2) 
           OR (user1_id = $2 AND user2_id = $1)
        LIMIT 1
      `, [userId, product.seller_id]);
      console.log('🔍 Conversation query result:', conversation.rows.length > 0 ? 'FOUND' : 'NOT FOUND');
    } catch (dbError) {
      console.error('❌ Error finding conversation:', dbError);
      return res.status(500).json({
        error: 'Database error finding conversation',
        code: 'DATABASE_ERROR'
      });
    }

    let conversationId;
    if (conversation.rows.length === 0) {
      console.log('📝 Creating new conversation for product message...');
      try {
        const newConversation = await dbQueries.query(`
          INSERT INTO conversations (uuid, user1_id, user2_id, created_at, updated_at)
          VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          RETURNING id
        `, [crypto.randomUUID(), userId, product.seller_id]);
        conversationId = newConversation.rows[0].id;
        console.log('✅ Created conversation ID:', conversationId);
      } catch (dbError) {
        console.error('❌ Error creating conversation:', dbError);
        console.error('❌ Full error:', dbError);
        return res.status(500).json({
          error: 'Database error creating conversation',
          code: 'DATABASE_ERROR'
        });
      }
    } else {
      conversationId = conversation.rows[0].id;
      console.log('✅ Using existing conversation ID:', conversationId);
    }

    // STEP 2: Try different message creation approaches
    const messageUuid = crypto.randomUUID();
    const defaultMessage = message_text || `Hi! I'm interested in your product "${product.name}". Is it still available?`;
    
    console.log('💾 Attempting to create message...');
    console.log('📝 Message data:');
    console.log('  - UUID:', messageUuid);
    console.log('  - Conversation ID:', conversationId);
    console.log('  - Sender ID:', userId);
    console.log('  - Receiver ID:', product.seller_id);
    console.log('  - Message text:', defaultMessage);
    console.log('  - Product ID:', productId);

    // Try different approaches to insert the message
    let messageResult;
    let insertApproach = 'unknown';

    // APPROACH 1: Try with all common columns
    try {
      console.log('🧪 Attempting full message insert (Approach 1)...');
      insertApproach = 'full';
      
      messageResult = await dbQueries.query(`
        INSERT INTO messages (
          uuid, conversation_id, sender_id, receiver_id, 
          message_text, message_type, product_id, 
          status, is_read, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'sent', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *
      `, [
        messageUuid, conversationId, userId, product.seller_id, 
        defaultMessage, 'product_reference', productId
      ]);
      
      console.log('✅ Full message created with ID:', messageResult.rows[0].id);
      
    } catch (fullError) {
      console.error('❌ Full message insert failed:', fullError);
      console.error('❌ Error details:', {
        message: fullError.message,
        code: fullError.code,
        detail: fullError.detail,
        hint: fullError.hint
      });
      
      // APPROACH 2: Try without uuid and status columns
      try {
        console.log('🧪 Attempting simplified message insert (Approach 2)...');
        insertApproach = 'simplified';
        
        messageResult = await dbQueries.query(`
          INSERT INTO messages (
            sender_id, receiver_id, message_text, message_type, 
            conversation_id, product_id, is_read, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          RETURNING *
        `, [
          userId, product.seller_id, defaultMessage, 'product_reference', 
          conversationId, productId
        ]);
        
        console.log('✅ Simplified message created with ID:', messageResult.rows[0].id);
        
      } catch (simplifiedError) {
        console.error('❌ Simplified message insert failed:', simplifiedError);
        console.error('❌ Error details:', {
          message: simplifiedError.message,
          code: simplifiedError.code,
          detail: simplifiedError.detail,
          hint: simplifiedError.hint
        });
        
        // APPROACH 3: Try with only essential columns (no conversation_id, product_id)
        try {
          console.log('🧪 Attempting minimal message insert (Approach 3)...');
          insertApproach = 'minimal';
          
          messageResult = await dbQueries.query(`
            INSERT INTO messages (
              sender_id, receiver_id, message_text, message_type, 
              is_read, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING *
          `, [
            userId, product.seller_id, defaultMessage, 'product_reference'
          ]);
          
          console.log('✅ Minimal message created with ID:', messageResult.rows[0].id);
          
        } catch (minimalError) {
          console.error('❌ Minimal message insert failed:', minimalError);
          console.error('❌ Error details:', {
            message: minimalError.message,
            code: minimalError.code,
            detail: minimalError.detail,
            hint: minimalError.hint
          });
          
          // APPROACH 4: Ultra-minimal (just required fields)
          try {
            console.log('🧪 Attempting ultra-minimal message insert (Approach 4)...');
            insertApproach = 'ultra-minimal';
            
            messageResult = await dbQueries.query(`
              INSERT INTO messages (
                sender_id, message_text, created_at
              )
              VALUES ($1, $2, CURRENT_TIMESTAMP)
              RETURNING *
            `, [userId, defaultMessage]);
            
            console.log('✅ Ultra-minimal message created with ID:', messageResult.rows[0].id);
            
          } catch (ultraError) {
            console.error('❌ Ultra-minimal message insert failed:', ultraError);
            console.error('❌ Error details:', {
              message: ultraError.message,
              code: ultraError.code,
              detail: ultraError.detail,
              hint: ultraError.hint
            });
            
            return res.status(500).json({
              error: 'Database error creating message - all approaches failed',
              code: 'DATABASE_ERROR',
              details: ultraError.message
            });
          }
        }
      }
    }

    console.log(`✅ Message created successfully using ${insertApproach} approach`);

    // Update conversation if we have both conversation and message
    if (conversationId && messageResult) {
      try {
        await dbQueries.query(`
          UPDATE conversations 
          SET updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [conversationId]);
        console.log('✅ Conversation updated');
      } catch (dbError) {
        console.error('❌ Error updating conversation:', dbError);
        // Don't fail the request for this
      }
    }

    console.log('🎉 SUCCESS: Product message sent successfully');
    
    res.status(201).json({
      success: true,
      message: 'Product message sent to seller successfully',
      approach: insertApproach,
      data: {
        message_id: messageResult.rows[0].id,
        conversation_id: conversationId,
        product: {
          id: product.id,
          name: product.name,
          seller_name: product.seller_name
        },
        created_message: messageResult.rows[0]
      }
    });

  } catch (error) {
    console.error('❌ UNHANDLED ERROR in product message route:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR',
      details: error.message
    });
  }
});

// @route   POST /api/messages/send
// @desc    Send a message (fixed for user1_id/user2_id structure)
// @access  Private
router.post('/send', validateSendMessage, async (req, res) => {
  try {
    const { recipient_id, message_text, message_type = 'text' } = req.validatedData;
    const senderId = req.user.id;

    console.log(`💬 Sending message from ${senderId} to ${recipient_id}`);

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

    // Find or create conversation using user1_id/user2_id
    const conversation = await dbQueries.query(`
      SELECT id FROM conversations 
      WHERE (user1_id = $1 AND user2_id = $2) 
         OR (user1_id = $2 AND user2_id = $1)
      LIMIT 1
    `, [senderId, recipient_id]);

    let conversationId;
    if (conversation.rows.length === 0) {
      console.log('📝 Creating new conversation for message...');
      // Create new conversation
      const newConversation = await dbQueries.query(`
        INSERT INTO conversations (uuid, user1_id, user2_id, created_at, updated_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
      `, [crypto.randomUUID(), senderId, recipient_id]);
      conversationId = newConversation.rows[0].id;
      console.log('✅ Created conversation:', conversationId);
    } else {
      conversationId = conversation.rows[0].id;
      console.log('✅ Using existing conversation:', conversationId);
    }

    // Generate UUID for the message
    const messageUuid = crypto.randomUUID();

    // Save message - use simplified approach that worked
    let message;
    try {
      message = await dbQueries.query(`
        INSERT INTO messages (sender_id, receiver_id, message_text, message_type, conversation_id, is_read, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *
      `, [senderId, recipient_id, message_text, message_type, conversationId]);
    } catch (error) {
      // Fallback to minimal approach
      message = await dbQueries.query(`
        INSERT INTO messages (sender_id, message_text, created_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        RETURNING *
      `, [senderId, message_text]);
    }

    // Update conversation timestamp
    if (conversationId) {
      try {
        await dbQueries.query(`
          UPDATE conversations 
          SET updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [conversationId]);
      } catch (error) {
        console.error('❌ Error updating conversation:', error);
      }
    }

    // Get complete message data
    let messageData;
    try {
      const messageDataResult = await dbQueries.query(`
        SELECT m.*, u.name as sender_name
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.id = $1
      `, [message.rows[0].id]);
      messageData = messageDataResult.rows[0];
    } catch (error) {
      messageData = message.rows[0];
    }

    console.log('✅ Message sent successfully');
    res.status(201).json({
      message: 'Message sent successfully',
      data: messageData
    });
  } catch (error) {
    console.error('❌ Send message error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'SEND_MESSAGE_ERROR'
    });
  }
});

// @route   GET /api/messages/conversation/:userId
// @desc    Get messages in a conversation with product data included
// @access  Private
router.get('/conversation/:userId', async (req, res) => {
  try {
    const { userId: otherUserId } = req.params;
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    console.log(`💬 Getting conversation between user ${userId} and user ${otherUserId}`);

    // Verify other user exists
    const otherUser = await dbQueries.findUserById(otherUserId);
    if (!otherUser) {
      return res.status(404).json({ 
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Find or create conversation using user1_id/user2_id
    const conversation = await dbQueries.query(`
      SELECT id FROM conversations 
      WHERE (user1_id = $1 AND user2_id = $2) 
         OR (user1_id = $2 AND user2_id = $1)
      LIMIT 1
    `, [userId, otherUserId]);

    let conversationId;
    if (conversation.rows.length === 0) {
      console.log('📝 Creating new conversation...');
      const newConversation = await dbQueries.query(`
        INSERT INTO conversations (uuid, user1_id, user2_id, created_at, updated_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
      `, [crypto.randomUUID(), userId, otherUserId]);
      conversationId = newConversation.rows[0].id;
    } else {
      conversationId = conversation.rows[0].id;
    }

    // Get messages with product information
    let messages;
    try {
      messages = await dbQueries.query(`
        SELECT 
          m.*, 
          u.name as sender_name,
          p.name as product_name,
          p.price as product_price,
          p.image_url as product_image,
          p.is_active as product_active,
          p.quantity as product_quantity
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        LEFT JOIN products p ON m.product_id = p.id
        WHERE m.conversation_id = $1
        ORDER BY m.created_at DESC
        LIMIT $2 OFFSET $3
      `, [conversationId, limit, offset]);
    } catch (error) {
      // Fallback query without product joins if product_id column doesn't exist
      messages = await dbQueries.query(`
        SELECT 
          m.*, 
          u.name as sender_name
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.conversation_id = $1
        ORDER BY m.created_at DESC
        LIMIT $2 OFFSET $3
      `, [conversationId, limit, offset]);
    }

    // Process messages to include product data
    const processedMessages = messages.rows.map(row => {
      const message = {
        id: row.id,
        uuid: row.uuid,
        conversation_id: row.conversation_id,
        sender_id: row.sender_id,
        receiver_id: row.receiver_id,
        message_text: row.message_text,
        message_type: row.message_type,
        status: row.status,
        is_read: row.is_read,
        created_at: row.created_at,
        updated_at: row.updated_at,
        sender_name: row.sender_name,
        product_id: row.product_id
      };

      // If this is a product reference message, include product data
      if (row.message_type === 'product_reference' && row.product_id) {
        try {
          // Try to parse the message_text as JSON (for new format)
          const messageData = JSON.parse(row.message_text);
          message.product_data = messageData.product;
          message.text_content = messageData.text;
        } catch (e) {
          // Fallback to database product info for older messages
          message.text_content = row.message_text;
          if (row.product_name) {
            message.product_data = {
              id: row.product_id,
              name: row.product_name,
              price: row.product_price,
              image_url: row.product_image,
              is_active: row.product_active,
              quantity: row.product_quantity
            };
          }
        }
      }

      return message;
    });

    // Get total count
    const countResult = await dbQueries.query(`
      SELECT COUNT(*) as total
      FROM messages
      WHERE conversation_id = $1
    `, [conversationId]);

    const total = parseInt(countResult.rows[0].total);

    console.log(`✅ Found ${processedMessages.length} messages in conversation ${conversationId}`);

    res.json({
      messages: processedMessages.reverse(), // Reverse to show oldest first
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
    console.error('❌ Get conversation error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_CONVERSATION_ERROR'
    });
  }
});

// @route   PUT /api/messages/:id/read
// @desc    Mark message as read
// @access  Private
router.put('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;

    // Try different approaches to mark as read
    let result;
    try {
      result = await dbQueries.query(
        'UPDATE messages SET is_read = true, status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
        ['read', id]
      );
    } catch (error) {
      // Fallback if status column doesn't exist
      result = await dbQueries.query(
        'UPDATE messages SET is_read = true WHERE id = $1 RETURNING *',
        [id]
      );
    }

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
    console.error('❌ Mark message read error:', error);
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

    // Find conversation using user1_id/user2_id
    const conversation = await dbQueries.query(`
      SELECT id FROM conversations 
      WHERE (user1_id = $1 AND user2_id = $2) 
         OR (user1_id = $2 AND user2_id = $1)
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
    let result;
    try {
      result = await dbQueries.query(`
        UPDATE messages 
        SET is_read = true, status = 'read', updated_at = CURRENT_TIMESTAMP 
        WHERE conversation_id = $1 AND receiver_id = $2 AND (is_read = false OR is_read IS NULL)
      `, [conversationId, userId]);
    } catch (error) {
      // Fallback without status column
      result = await dbQueries.query(`
        UPDATE messages 
        SET is_read = true
        WHERE conversation_id = $1 AND receiver_id = $2 AND (is_read = false OR is_read IS NULL)
      `, [conversationId, userId]);
    }

    res.json({
      message: 'Messages marked as read',
      updated_count: result.rowCount
    });
  } catch (error) {
    console.error('❌ Mark conversation read error:', error);
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
    console.error('❌ Delete message error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'DELETE_MESSAGE_ERROR'
    });
  }
});

module.exports = router;