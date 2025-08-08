/* eslint-disable no-unused-vars */
// routes/orders.js - Order management routes
const express = require('express');
const router = express.Router();
const { dbQueries, transaction } = require('../config/database');
const { authenticateToken, authorize } = require('../middleware/auth');
const { orderSchemas, validate } = require('../validation/schemas');
const { v4: uuidv4 } = require('uuid');
const { sendOrderNotification } = require('./notifications');

// Generate order number
const generateOrderNumber = () => {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.random().toString(36).substr(2, 4).toUpperCase();
  return `ORD-${timestamp}-${random}`;
};

// @route   POST /api/orders/from-cart
// @desc    Create a new order from cart items
// @access  Private (Buyers only)
router.post('/from-cart', authenticateToken, authorize('buyer'), async (req, res) => {
  try {
    const { delivery_address, payment_method, phone_number, provider } = req.body;
    const buyerId = req.user.id;

    if (!delivery_address || !payment_method) {
      return res.status(400).json({ 
        error: 'Delivery address and payment method are required',
        code: 'REQUIRED_FIELDS_MISSING'
      });
    }

    // Get current cart items
    const cartItems = await dbQueries.getCartItems(buyerId);
    
    if (!cartItems || cartItems.length === 0) {
      return res.status(400).json({ 
        error: 'Cart is empty',
        code: 'EMPTY_CART'
      });
    }

    // Create order from cart items
    const orderDetails = await transaction(async (client) => {
      let subtotal = 0;
      const sellerIds = new Set();
      const orderItems = [];

      // Calculate totals and validate items
      for (const item of cartItems) {
        // Check quantity availability again
        const product = await client.query(
          'SELECT quantity FROM products WHERE id = $1 AND is_active = true',
          [item.product_id]
        );

        if (product.rows.length === 0 || product.rows[0].quantity < item.quantity) {
          throw new Error(`Product ${item.name} is no longer available in requested quantity`);
        }

        const itemSubtotal = parseFloat(item.price) * item.quantity;
        subtotal += itemSubtotal;
        sellerIds.add(item.seller_id);

        orderItems.push({
          product_id: item.product_id,
          product_name: item.name,
          product_image: item.image_url,
          price: item.price,
          quantity: item.quantity,
          subtotal: itemSubtotal,
          seller_id: item.seller_id
        });
      }

      // Calculate fees (same as existing logic)
      const deliveryFee = 2.50;
      const serviceFee = subtotal * 0.03;
      const tax = subtotal * 0.08;
      const total = subtotal + deliveryFee + serviceFee + tax;

      // Create order
      const orderNumber = generateOrderNumber();
      const primarySellerId = Array.from(sellerIds)[0];

      const order = await client.query(`
        INSERT INTO orders (
          order_number, buyer_id, seller_id, status, payment_status,
          subtotal, delivery_fee, service_fee, tax, total,
          delivery_address_line1, delivery_city, delivery_state, delivery_country,
          payment_method_type, estimated_delivery, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING *
      `, [
        orderNumber, buyerId, primarySellerId, 'pending', 'pending',
        subtotal, deliveryFee, serviceFee, tax, total,
        delivery_address, 'City', 'State', 'Country', // Simplified for now
        payment_method, new Date(Date.now() + 24 * 60 * 60 * 1000),
        new Date(), new Date()
      ]);

      const orderId = order.rows[0].id;

      // Insert order items
      for (const orderItem of orderItems) {
        await client.query(`
          INSERT INTO order_items (
            order_id, product_id, product_name, product_image,
            price, quantity, subtotal
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          orderId, orderItem.product_id,
          orderItem.product_name, orderItem.product_image,
          orderItem.price, orderItem.quantity, orderItem.subtotal
        ]);
      }

      // Clear cart after order creation
      await client.query('DELETE FROM cart_items WHERE user_id = $1', [buyerId]);

      // Add order status history
      await client.query(`
        INSERT INTO order_status_history (order_id, status, note, created_at)
        VALUES ($1, $2, $3, $4)
      `, [orderId, 'pending', 'Order created', new Date()]);

      return {
        id: orderId,
        order_number: orderNumber,
        total: total.toFixed(2),
        items: orderItems
      };
    });

    console.log('✅ Order created from cart:', orderDetails.order_number);
    
    res.status(201).json({
      message: 'Order created successfully',
      data: orderDetails
    });

  } catch (error) {
    console.error('❌ Create order from cart error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'CREATE_ORDER_ERROR',
      details: error.message
    });
  }
});

// @route   POST /api/orders
// @desc    Create a new order
// @access  Private (Buyers only)
router.post('/', authenticateToken, authorize('buyer'), validate(orderSchemas.create), async (req, res) => {
  try {
    const { items, delivery_address, payment_method } = req.validatedData;
    const buyerId = req.user.id;

    // Validate and calculate order details
    const orderDetails = await transaction(async (client) => {
      const orderItems = [];
      let subtotal = 0;
      const sellerIds = new Set();

      // Validate each item and calculate totals
      for (const item of items) {
        const product = await client.query(
          'SELECT * FROM products WHERE id = $1 AND is_active = true',
          [item.product_id]
        );

        if (product.rows.length === 0) {
          throw new Error(`Product ${item.product_id} not found`);
        }

        const productData = product.rows[0];

        // Check if buyer is trying to buy their own product
        if (productData.seller_id === buyerId) {
          throw new Error(`Cannot purchase your own product: ${productData.name}`);
        }

        // Check quantity availability
        if (productData.quantity < item.quantity) {
          throw new Error(`Insufficient quantity for ${productData.name}. Available: ${productData.quantity}, Requested: ${item.quantity}`);
        }

        const itemSubtotal = parseFloat(productData.price) * item.quantity;
        subtotal += itemSubtotal;
        sellerIds.add(productData.seller_id);

        orderItems.push({
          product_id: item.product_id,
          product_name: productData.name,
          product_image: productData.image_url,
          price: productData.price,
          quantity: item.quantity,
          subtotal: itemSubtotal,
          seller_id: productData.seller_id
        });
      }

      // For now, we'll create one order per seller
      // In a more complex system, you might want to create separate orders for each seller
      const primarySellerId = Array.from(sellerIds)[0];
      
      // Calculate fees
      const deliveryFee = 2.50;
      const serviceFee = subtotal * 0.03;
      const tax = subtotal * 0.08; // 8% tax
      const total = subtotal + deliveryFee + serviceFee + tax;

      // Create order
      const orderNumber = generateOrderNumber();
      const estimatedDelivery = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

      const orderData = {
        order_number: orderNumber,
        buyer_id: buyerId,
        seller_id: primarySellerId,
        delivery_address_name: delivery_address.name,
        delivery_full_name: delivery_address.full_name,
        delivery_phone: delivery_address.phone,
        delivery_address_line1: delivery_address.address_line1,
        delivery_address_line2: delivery_address.address_line2,
        delivery_city: delivery_address.city,
        delivery_state: delivery_address.state,
        delivery_zip_code: delivery_address.zip_code,
        delivery_country: delivery_address.country,
        delivery_instructions: delivery_address.delivery_instructions,
        payment_method_type: payment_method.type,
        payment_method_last4: payment_method.last4,
        subtotal,
        delivery_fee: deliveryFee,
        service_fee: serviceFee,
        tax,
        total,
        estimated_delivery: estimatedDelivery
      };

      const order = await dbQueries.createOrder(orderData);

      // Create order items
      for (const item of orderItems) {
        await dbQueries.createOrderItem({
          order_id: order.id,
          ...item
        });

        // Update product quantity
        await client.query(
          'UPDATE products SET quantity = quantity - $1, sold_quantity = sold_quantity + $1 WHERE id = $2',
          [item.quantity, item.product_id]
        );
      }

      // Add initial status to history
      await client.query(
        'INSERT INTO order_status_history (order_id, status, note) VALUES ($1, $2, $3)',
        [order.id, 'pending', 'Order placed successfully']
      );

      // Clear cart items for purchased products
      for (const item of orderItems) {
        await client.query(
          'DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2',
          [buyerId, item.product_id]
        );
      }

      return { order, orderItems };
    });

    // Create notifications for sellers
    await dbQueries.query(
      `INSERT INTO notifications (user_id, notification_type, title, message, order_id, priority)
       VALUES ($1, 'order', 'New Order Received', 'You have received a new order', $2, 'high')`,
      [orderDetails.order.seller_id, orderDetails.order.id]
    );

    res.status(201).json({
      message: 'Order created successfully',
      order: {
        ...orderDetails.order,
        items: orderDetails.orderItems
      }
    });
  } catch (error) {
    console.error('Create order error:', error);
    
    if (error.message.includes('not found') || error.message.includes('Insufficient quantity') || error.message.includes('Cannot purchase')) {
      return res.status(400).json({ 
        error: error.message,
        code: 'ORDER_VALIDATION_ERROR'
      });
    }
    
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'CREATE_ORDER_ERROR'
    });
  }
});

// @route   GET /api/orders
// @desc    Get user's orders
// @access  Private
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.user_type;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;

    const offset = (page - 1) * limit;

    let queryText = `
      SELECT o.*, 
        json_agg(
          json_build_object(
            'id', oi.id,
            'product_id', oi.product_id,
            'product_name', oi.product_name,
            'product_image', oi.product_image,
            'price', oi.price,
            'quantity', oi.quantity,
            'subtotal', oi.subtotal
          )
        ) as items,
        bu.name as buyer_name, bu.phone as buyer_phone,
        su.name as seller_name, su.phone as seller_phone, su.shop_name
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN users bu ON o.buyer_id = bu.id
      LEFT JOIN users su ON o.seller_id = su.id
      WHERE o.${userType === 'buyer' ? 'buyer_id' : 'seller_id'} = $1
    `;

    const params = [userId];
    let paramCount = 2;

    if (status) {
      queryText += ` AND o.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    queryText += ` GROUP BY o.id, bu.name, bu.phone, su.name, su.phone, su.shop_name
                   ORDER BY o.created_at DESC
                   LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    
    params.push(limit, offset);

    const result = await dbQueries.query(queryText, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM orders WHERE ${userType === 'buyer' ? 'buyer_id' : 'seller_id'} = $1`;
    const countParams = [userId];

    if (status) {
      countQuery += ' AND status = $2';
      countParams.push(status);
    }

    const countResult = await dbQueries.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      orders: result.rows,
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
    console.error('Get orders error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_ORDERS_ERROR'
    });
  }
});

// @route   GET /api/orders/:id
// @desc    Get order details
// @access  Private
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userType = req.user.user_type;

    const order = await dbQueries.getOrderById(id);

    if (!order) {
      return res.status(404).json({ 
        error: 'Order not found',
        code: 'ORDER_NOT_FOUND'
      });
    }

    // Check if user has access to this order
    if (order.buyer_id !== userId && order.seller_id !== userId) {
      return res.status(403).json({ 
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    // Get order status history
    const statusHistory = await dbQueries.query(
      'SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY created_at ASC',
      [id]
    );

    res.json({
      order: {
        ...order,
        status_history: statusHistory.rows
      }
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_ORDER_ERROR'
    });
  }
});

// @route   PUT /api/orders/:id/status
// @desc    Update order status
// @access  Private (Sellers only)
router.put('/:id/status', authenticateToken, authorize('seller'), validate(orderSchemas.updateStatus), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, note } = req.validatedData;
    const userId = req.user.id;

    // Get order details
    const order = await dbQueries.getOrderById(id);

    if (!order) {
      return res.status(404).json({ 
        error: 'Order not found',
        code: 'ORDER_NOT_FOUND'
      });
    }

    // Check if user is the seller of this order
    if (order.seller_id !== userId) {
      return res.status(403).json({ 
        error: 'Access denied - not order seller',
        code: 'NOT_ORDER_SELLER'
      });
    }

    // Validate status transition
    const validTransitions = {
      'pending': ['confirmed', 'cancelled'],
      'confirmed': ['preparing', 'cancelled'],
      'preparing': ['ready', 'cancelled'],
      'ready': ['out_for_delivery', 'delivered'],
      'out_for_delivery': ['delivered'],
      'delivered': [], // No transitions from delivered
      'cancelled': [] // No transitions from cancelled
    };

    if (!validTransitions[order.status].includes(status)) {
      return res.status(400).json({ 
        error: `Cannot change order status from ${order.status} to ${status}`,
        code: 'INVALID_STATUS_TRANSITION'
      });
    }

    // Update order status
    await dbQueries.updateOrderStatus(id, status, note);

    // Set actual delivery time if delivered
    if (status === 'delivered') {
      await dbQueries.query(
        'UPDATE orders SET actual_delivery = CURRENT_TIMESTAMP WHERE id = $1',
        [id]
      );
    }

    // Create notification for buyer
    let notificationMessage = `Your order status has been updated to ${status}`;
    if (note) {
      notificationMessage += `: ${note}`;
    }

    await dbQueries.query(
      `INSERT INTO notifications (user_id, notification_type, title, message, order_id, priority)
       VALUES ($1, 'order', 'Order Status Updated', $2, $3, 'medium')`,
      [order.buyer_id, notificationMessage, id]
    );

    // Send push notification
    try {
      await sendOrderNotification({
        orderId: id,
        buyerId: order.buyer_id,
        sellerId: order.seller_id,
        status,
        orderNumber: order.order_number
      });
    } catch (pushError) {
      console.warn('⚠️ Failed to send push notification for order update:', pushError.message);
    }

    res.json({
      message: 'Order status updated successfully',
      order_id: id,
      status,
      note
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'UPDATE_ORDER_STATUS_ERROR'
    });
  }
});

// @route   POST /api/orders/:id/cancel
// @desc    Cancel order
// @access  Private (Buyers and Sellers)
router.post('/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    const order = await dbQueries.getOrderById(id);

    if (!order) {
      return res.status(404).json({ 
        error: 'Order not found',
        code: 'ORDER_NOT_FOUND'
      });
    }

    // Check if user has permission to cancel
    if (order.buyer_id !== userId && order.seller_id !== userId) {
      return res.status(403).json({ 
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    // Check if order can be cancelled
    if (['delivered', 'cancelled'].includes(order.status)) {
      return res.status(400).json({ 
        error: 'Order cannot be cancelled',
        code: 'CANNOT_CANCEL_ORDER'
      });
    }

    // Cancel order
    await transaction(async (client) => {
      // Update order status
      await client.query(
        'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['cancelled', id]
      );

      // Add to status history
      await client.query(
        'INSERT INTO order_status_history (order_id, status, note) VALUES ($1, $2, $3)',
        [id, 'cancelled', reason || 'Order cancelled']
      );

      // Restore product quantities
      const orderItems = await client.query(
        'SELECT product_id, quantity FROM order_items WHERE order_id = $1',
        [id]
      );

      for (const item of orderItems.rows) {
        await client.query(
          'UPDATE products SET quantity = quantity + $1, sold_quantity = sold_quantity - $1 WHERE id = $2',
          [item.quantity, item.product_id]
        );
      }
    });

    // Create notification for the other party
    const notificationUserId = order.buyer_id === userId ? order.seller_id : order.buyer_id;
    const notificationMessage = `Order has been cancelled${reason ? `: ${reason}` : ''}`;

    await dbQueries.query(
      `INSERT INTO notifications (user_id, notification_type, title, message, order_id, priority)
       VALUES ($1, 'order', 'Order Cancelled', $2, $3, 'high')`,
      [notificationUserId, notificationMessage, id]
    );

    res.json({
      message: 'Order cancelled successfully',
      order_id: id
    });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'CANCEL_ORDER_ERROR'
    });
  }
});

// @route   GET /api/orders/stats/dashboard
// @desc    Get order statistics for dashboard
// @access  Private (Sellers only)
router.get('/stats/dashboard', authenticateToken, authorize('seller'), async (req, res) => {
  try {
    const userId = req.user.id;
    const timeRange = req.query.range || '30d'; // 7d, 30d, 90d

    let dateFilter = '';
    switch (timeRange) {
      case '7d':
        dateFilter = "AND o.created_at >= NOW() - INTERVAL '7 days'";
        break;
      case '90d':
        dateFilter = "AND o.created_at >= NOW() - INTERVAL '90 days'";
        break;
      default:
        dateFilter = "AND o.created_at >= NOW() - INTERVAL '30 days'";
    }

    // Get order statistics
    const stats = await dbQueries.query(
      `SELECT 
        COUNT(*) as total_orders,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as completed_orders,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
        SUM(CASE WHEN status = 'delivered' THEN total ELSE 0 END) as total_revenue,
        AVG(CASE WHEN status = 'delivered' THEN total ELSE NULL END) as avg_order_value
       FROM orders o
       WHERE o.seller_id = $1 ${dateFilter}`,
      [userId]
    );

    // Get recent orders
    const recentOrders = await dbQueries.query(
      `SELECT o.id, o.order_number, o.status, o.total, o.created_at, u.name as buyer_name
       FROM orders o
       JOIN users u ON o.buyer_id = u.id
       WHERE o.seller_id = $1
       ORDER BY o.created_at DESC
       LIMIT 10`,
      [userId]
    );

    // Get top products
    const topProducts = await dbQueries.query(
      `SELECT p.id, p.name, SUM(oi.quantity) as total_sold, SUM(oi.subtotal) as total_revenue
       FROM products p
       JOIN order_items oi ON p.id = oi.product_id
       JOIN orders o ON oi.order_id = o.id
       WHERE p.seller_id = $1 AND o.status = 'delivered' ${dateFilter}
       GROUP BY p.id, p.name
       ORDER BY total_sold DESC
       LIMIT 5`,
      [userId]
    );

    res.json({
      stats: stats.rows[0],
      recent_orders: recentOrders.rows,
      top_products: topProducts.rows
    });
  } catch (error) {
    console.error('Get order stats error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_ORDER_STATS_ERROR'
    });
  }
});

module.exports = router;