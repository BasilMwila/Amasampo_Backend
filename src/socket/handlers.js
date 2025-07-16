/* eslint-disable no-unused-vars */
// socket/handlers.js - Socket.IO event handlers
const jwt = require('jsonwebtoken');
const { dbQueries } = require('../config/database');

// Store active connections
const activeConnections = new Map();

// Socket authentication middleware
const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await dbQueries.findUserById(decoded.id);
    
    if (!user || !user.is_active) {
      return next(new Error('Invalid user'));
    }

    socket.user = user;
    next();
  } catch (error) {
    next(new Error('Authentication failed'));
  }
};

// Setup socket handlers
const setupSocketHandlers = (io) => {
  // Authentication middleware
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    console.log(`User ${socket.user.name} connected (${socket.id})`);
    
    // Store connection
    activeConnections.set(socket.user.id, {
      socketId: socket.id,
      user: socket.user,
      lastSeen: new Date()
    });

    // Join user to their personal room
    socket.join(`user_${socket.user.id}`);

    // Handle user joining chat rooms
    socket.on('join_chat', async (data) => {
      try {
        const { recipientId } = data;
        
        // Create chat room ID (consistent regardless of who joins first)
        const chatRoomId = [socket.user.id, recipientId].sort().join('_');
        socket.join(chatRoomId);
        
        // Notify that user joined
        socket.to(chatRoomId).emit('user_joined', {
          userId: socket.user.id,
          userName: socket.user.name
        });

        // Send recent messages
        const messages = await dbQueries.query(`
          SELECT m.*, 
            u1.name as sender_name,
            u2.name as recipient_name
          FROM messages m
          JOIN users u1 ON m.sender_id = u1.id
          JOIN users u2 ON m.recipient_id = u2.id
          WHERE (m.sender_id = $1 AND m.recipient_id = $2) 
             OR (m.sender_id = $2 AND m.recipient_id = $1)
          ORDER BY m.created_at DESC
          LIMIT 50
        `, [socket.user.id, recipientId]);

        socket.emit('recent_messages', {
          messages: messages.rows.reverse()
        });

      } catch (error) {
        console.error('Join chat error:', error);
        socket.emit('error', { message: 'Failed to join chat' });
      }
    });

    // Handle sending messages
    socket.on('send_message', async (data) => {
      try {
        const { recipientId, messageText, messageType = 'text', productId } = data;

        // Validate recipient
        const recipient = await dbQueries.findUserById(recipientId);
        if (!recipient) {
          socket.emit('error', { message: 'Recipient not found' });
          return;
        }

        // Save message to database
        const message = await dbQueries.query(`
          INSERT INTO messages (sender_id, recipient_id, message_text, message_type, product_id)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `, [socket.user.id, recipientId, messageText, messageType, productId]);

        const messageData = {
          ...message.rows[0],
          sender_name: socket.user.name,
          recipient_name: recipient.name
        };

        // Create chat room ID
        const chatRoomId = [socket.user.id, recipientId].sort().join('_');

        // Emit to all users in the chat room
        io.to(chatRoomId).emit('new_message', messageData);

        // Send push notification to recipient if not online
        const recipientConnection = activeConnections.get(recipientId);
        if (!recipientConnection) {
          // Create notification
          await dbQueries.query(`
            INSERT INTO notifications (user_id, notification_type, title, message, priority)
            VALUES ($1, 'message', 'New Message', $2, 'medium')
          `, [recipientId, `New message from ${socket.user.name}`]);
        }

        // Emit to recipient's personal room for notifications
        socket.to(`user_${recipientId}`).emit('new_message_notification', {
          senderId: socket.user.id,
          senderName: socket.user.name,
          message: messageText,
          messageType
        });

      } catch (error) {
        console.error('Send message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle message read status
    socket.on('mark_messages_read', async (data) => {
      try {
        const { senderId } = data;

        await dbQueries.query(`
          UPDATE messages 
          SET is_read = true 
          WHERE sender_id = $1 AND recipient_id = $2 AND is_read = false
        `, [senderId, socket.user.id]);

        // Notify sender that messages were read
        socket.to(`user_${senderId}`).emit('messages_read', {
          readBy: socket.user.id
        });

      } catch (error) {
        console.error('Mark messages read error:', error);
      }
    });

    // Handle order status updates
    socket.on('order_status_update', async (data) => {
      try {
        const { orderId, status, note } = data;

        // Only sellers can update order status
        if (socket.user.user_type !== 'seller') {
          socket.emit('error', { message: 'Unauthorized' });
          return;
        }

        // Get order details
        const order = await dbQueries.getOrderById(orderId);
        if (!order || order.seller_id !== socket.user.id) {
          socket.emit('error', { message: 'Order not found or access denied' });
          return;
        }

        // Update order status
        await dbQueries.updateOrderStatus(orderId, status, note);

        // Notify buyer
        socket.to(`user_${order.buyer_id}`).emit('order_status_changed', {
          orderId,
          orderNumber: order.order_number,
          status,
          note,
          updatedBy: socket.user.name
        });

        // Create notification
        await dbQueries.query(`
          INSERT INTO notifications (user_id, notification_type, title, message, order_id, priority)
          VALUES ($1, 'order', 'Order Status Updated', $2, $3, 'high')
        `, [order.buyer_id, `Your order ${order.order_number} status has been updated to ${status}`, orderId]);

      } catch (error) {
        console.error('Order status update error:', error);
        socket.emit('error', { message: 'Failed to update order status' });
      }
    });

    // Handle product updates (for sellers to notify about inventory changes)
    socket.on('product_update', async (data) => {
      try {
        const { productId, updateType, message } = data;

        // Only sellers can send product updates
        if (socket.user.user_type !== 'seller') {
          socket.emit('error', { message: 'Unauthorized' });
          return;
        }

        // Get product details
        const product = await dbQueries.getProductById(productId);
        if (!product || product.seller_id !== socket.user.id) {
          socket.emit('error', { message: 'Product not found or access denied' });
          return;
        }

        // Broadcast to all users (could be optimized to only notify interested users)
        io.emit('product_updated', {
          productId,
          productName: product.name,
          updateType,
          message,
          sellerName: socket.user.name
        });

      } catch (error) {
        console.error('Product update error:', error);
        socket.emit('error', { message: 'Failed to send product update' });
      }
    });

    // Handle typing indicators
    socket.on('typing_start', (data) => {
      const { recipientId } = data;
      const chatRoomId = [socket.user.id, recipientId].sort().join('_');
      
      socket.to(chatRoomId).emit('user_typing', {
        userId: socket.user.id,
        userName: socket.user.name
      });
    });

    socket.on('typing_stop', (data) => {
      const { recipientId } = data;
      const chatRoomId = [socket.user.id, recipientId].sort().join('_');
      
      socket.to(chatRoomId).emit('user_stopped_typing', {
        userId: socket.user.id,
        userName: socket.user.name
      });
    });

    // Handle user status updates
    socket.on('update_status', (data) => {
      const { status } = data; // online, away, busy, offline
      
      // Update connection info
      if (activeConnections.has(socket.user.id)) {
        activeConnections.set(socket.user.id, {
          ...activeConnections.get(socket.user.id),
          status,
          lastSeen: new Date()
        });
      }

      // Broadcast status to relevant users
      socket.broadcast.emit('user_status_changed', {
        userId: socket.user.id,
        userName: socket.user.name,
        status
      });
    });

    // Handle get online users
    socket.on('get_online_users', () => {
      const onlineUsers = Array.from(activeConnections.values()).map(conn => ({
        userId: conn.user.id,
        userName: conn.user.name,
        userType: conn.user.user_type,
        status: conn.status || 'online',
        lastSeen: conn.lastSeen
      }));

      socket.emit('online_users', onlineUsers);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`User ${socket.user.name} disconnected (${socket.id})`);
      
      // Remove from active connections
      activeConnections.delete(socket.user.id);
      
      // Broadcast user offline status
      socket.broadcast.emit('user_status_changed', {
        userId: socket.user.id,
        userName: socket.user.name,
        status: 'offline',
        lastSeen: new Date()
      });
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    // Send initial connection success
    socket.emit('connected', {
      message: 'Connected successfully',
      user: {
        id: socket.user.id,
        name: socket.user.name,
        user_type: socket.user.user_type
      }
    });
  });

  // Periodic cleanup of inactive connections
  setInterval(() => {
    const now = new Date();
    const timeout = 5 * 60 * 1000; // 5 minutes

    for (const [userId, connection] of activeConnections) {
      if (now - connection.lastSeen > timeout) {
        activeConnections.delete(userId);
        console.log(`Cleaned up inactive connection for user ${userId}`);
      }
    }
  }, 60000); // Check every minute
};

// Helper function to send notification to specific user
const sendNotificationToUser = (io, userId, notification) => {
  io.to(`user_${userId}`).emit('notification', notification);
};

// Helper function to get online users
const getOnlineUsers = () => {
  return Array.from(activeConnections.values()).map(conn => ({
    userId: conn.user.id,
    userName: conn.user.name,
    userType: conn.user.user_type,
    status: conn.status || 'online',
    lastSeen: conn.lastSeen
  }));
};

module.exports = {
  setupSocketHandlers,
  sendNotificationToUser,
  getOnlineUsers
};