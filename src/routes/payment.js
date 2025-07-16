// routes/payment.js - Payment management routes
const express = require('express');
const router = express.Router();
const { dbQueries, transaction } = require('../config/database');
const { paymentSchemas, validate } = require('../validation/schemas');

// @route   GET /api/payment/methods
// @desc    Get user's payment methods
// @access  Private
router.get('/methods', async (req, res) => {
  try {
    const userId = req.user.id;

    const paymentMethods = await dbQueries.query(
      'SELECT * FROM payment_methods WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC',
      [userId]
    );

    res.json({
      payment_methods: paymentMethods.rows
    });
  } catch (error) {
    console.error('Get payment methods error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_PAYMENT_METHODS_ERROR'
    });
  }
});

// @route   GET /api/payment/methods/:id
// @desc    Get single payment method
// @access  Private
router.get('/methods/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const paymentMethod = await dbQueries.query(
      'SELECT * FROM payment_methods WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (paymentMethod.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Payment method not found',
        code: 'PAYMENT_METHOD_NOT_FOUND'
      });
    }

    res.json({
      payment_method: paymentMethod.rows[0]
    });
  } catch (error) {
    console.error('Get payment method error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_PAYMENT_METHOD_ERROR'
    });
  }
});

// @route   POST /api/payment/methods
// @desc    Add new payment method
// @access  Private
router.post('/methods', validate(paymentSchemas.create), async (req, res) => {
  try {
    const userId = req.user.id;
    const paymentData = { ...req.validatedData, user_id: userId };

    const result = await transaction(async (client) => {
      // If this is set as default, unset other defaults
      if (paymentData.is_default) {
        await client.query(
          'UPDATE payment_methods SET is_default = false WHERE user_id = $1',
          [userId]
        );
      }

      // Insert new payment method
      const paymentMethod = await client.query(
        `INSERT INTO payment_methods (
          user_id, payment_type, brand, last4, expiry_month, expiry_year, 
          account_name, email, is_default
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
        RETURNING *`,
        [
          paymentData.user_id, paymentData.payment_type, paymentData.brand,
          paymentData.last4, paymentData.expiry_month, paymentData.expiry_year,
          paymentData.account_name, paymentData.email, paymentData.is_default
        ]
      );

      return paymentMethod.rows[0];
    });

    res.status(201).json({
      message: 'Payment method added successfully',
      payment_method: result
    });
  } catch (error) {
    console.error('Add payment method error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'ADD_PAYMENT_METHOD_ERROR'
    });
  }
});

// @route   PUT /api/payment/methods/:id
// @desc    Update payment method
// @access  Private
router.put('/methods/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { is_default } = req.body;

    // Check if payment method exists and belongs to user
    const existingPaymentMethod = await dbQueries.query(
      'SELECT * FROM payment_methods WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (existingPaymentMethod.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Payment method not found',
        code: 'PAYMENT_METHOD_NOT_FOUND'
      });
    }

    const result = await transaction(async (client) => {
      // If this is set as default, unset other defaults
      if (is_default) {
        await client.query(
          'UPDATE payment_methods SET is_default = false WHERE user_id = $1 AND id != $2',
          [userId, id]
        );
      }

      // Update payment method
      const updatedPaymentMethod = await client.query(
        'UPDATE payment_methods SET is_default = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *',
        [is_default, id, userId]
      );

      return updatedPaymentMethod.rows[0];
    });

    res.json({
      message: 'Payment method updated successfully',
      payment_method: result
    });
  } catch (error) {
    console.error('Update payment method error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'UPDATE_PAYMENT_METHOD_ERROR'
    });
  }
});

// @route   DELETE /api/payment/methods/:id
// @desc    Delete payment method
// @access  Private
router.delete('/methods/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if payment method exists and belongs to user
    const existingPaymentMethod = await dbQueries.query(
      'SELECT * FROM payment_methods WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (existingPaymentMethod.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Payment method not found',
        code: 'PAYMENT_METHOD_NOT_FOUND'
      });
    }

    // Cannot delete if it's the only payment method
    const paymentMethodCount = await dbQueries.query(
      'SELECT COUNT(*) as count FROM payment_methods WHERE user_id = $1',
      [userId]
    );

    if (parseInt(paymentMethodCount.rows[0].count) === 1) {
      return res.status(400).json({ 
        error: 'Cannot delete the only payment method',
        code: 'CANNOT_DELETE_ONLY_PAYMENT_METHOD'
      });
    }

    await transaction(async (client) => {
      // Delete payment method
      await client.query(
        'DELETE FROM payment_methods WHERE id = $1 AND user_id = $2',
        [id, userId]
      );

      // If deleted payment method was default, set another as default
      if (existingPaymentMethod.rows[0].is_default) {
        await client.query(
          'UPDATE payment_methods SET is_default = true WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
          [userId]
        );
      }
    });

    res.json({
      message: 'Payment method deleted successfully'
    });
  } catch (error) {
    console.error('Delete payment method error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'DELETE_PAYMENT_METHOD_ERROR'
    });
  }
});

// @route   POST /api/payment/methods/:id/set-default
// @desc    Set payment method as default
// @access  Private
router.post('/methods/:id/set-default', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if payment method exists and belongs to user
    const existingPaymentMethod = await dbQueries.query(
      'SELECT * FROM payment_methods WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (existingPaymentMethod.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Payment method not found',
        code: 'PAYMENT_METHOD_NOT_FOUND'
      });
    }

    await transaction(async (client) => {
      // Unset all defaults
      await client.query(
        'UPDATE payment_methods SET is_default = false WHERE user_id = $1',
        [userId]
      );

      // Set this payment method as default
      await client.query(
        'UPDATE payment_methods SET is_default = true WHERE id = $1 AND user_id = $2',
        [id, userId]
      );
    });

    res.json({
      message: 'Payment method set as default successfully'
    });
  } catch (error) {
    console.error('Set default payment method error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'SET_DEFAULT_PAYMENT_METHOD_ERROR'
    });
  }
});

// @route   GET /api/payment/methods/default
// @desc    Get default payment method
// @access  Private
router.get('/methods/default', async (req, res) => {
  try {
    const userId = req.user.id;

    const paymentMethod = await dbQueries.query(
      'SELECT * FROM payment_methods WHERE user_id = $1 AND is_default = true',
      [userId]
    );

    if (paymentMethod.rows.length === 0) {
      // Return first payment method if no default is set
      const firstPaymentMethod = await dbQueries.query(
        'SELECT * FROM payment_methods WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1',
        [userId]
      );

      if (firstPaymentMethod.rows.length === 0) {
        return res.status(404).json({ 
          error: 'No payment methods found',
          code: 'NO_PAYMENT_METHODS_FOUND'
        });
      }

      return res.json({
        payment_method: firstPaymentMethod.rows[0]
      });
    }

    res.json({
      payment_method: paymentMethod.rows[0]
    });
  } catch (error) {
    console.error('Get default payment method error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_DEFAULT_PAYMENT_METHOD_ERROR'
    });
  }
});

// @route   POST /api/payment/process
// @desc    Process payment
// @access  Private
router.post('/process', async (req, res) => {
  try {
    const { order_id, payment_method_id, amount } = req.body;
    const userId = req.user.id;

    if (!order_id || !payment_method_id || !amount) {
      return res.status(400).json({ 
        error: 'Order ID, payment method ID, and amount are required',
        code: 'REQUIRED_FIELDS_MISSING'
      });
    }

    // Get order details
    const order = await dbQueries.query(
      'SELECT * FROM orders WHERE id = $1 AND buyer_id = $2',
      [order_id, userId]
    );

    if (order.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Order not found',
        code: 'ORDER_NOT_FOUND'
      });
    }

    // Get payment method
    const paymentMethod = await dbQueries.query(
      'SELECT * FROM payment_methods WHERE id = $1 AND user_id = $2',
      [payment_method_id, userId]
    );

    if (paymentMethod.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Payment method not found',
        code: 'PAYMENT_METHOD_NOT_FOUND'
      });
    }

    // Verify amount matches order total
    if (parseFloat(amount) !== parseFloat(order.rows[0].total)) {
      return res.status(400).json({ 
        error: 'Amount does not match order total',
        code: 'AMOUNT_MISMATCH'
      });
    }

    // Process payment (simulation)
    const paymentResult = await processPayment({
      amount: parseFloat(amount),
      paymentMethod: paymentMethod.rows[0],
      order: order.rows[0]
    });

    if (paymentResult.success) {
      // Update order status
      await dbQueries.query(
        'UPDATE orders SET status = $1, payment_status = $2, payment_id = $3 WHERE id = $4',
        ['confirmed', 'paid', paymentResult.payment_id, order_id]
      );

      // Create payment record
      await dbQueries.query(
        `INSERT INTO payments (
          order_id, user_id, payment_method_id, amount, status, 
          payment_id, gateway_response
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          order_id, userId, payment_method_id, amount, 'completed',
          paymentResult.payment_id, JSON.stringify(paymentResult)
        ]
      );

      res.json({
        message: 'Payment processed successfully',
        payment_id: paymentResult.payment_id,
        status: 'completed'
      });
    } else {
      res.status(400).json({ 
        error: 'Payment failed',
        code: 'PAYMENT_FAILED',
        details: paymentResult.error
      });
    }
  } catch (error) {
    console.error('Process payment error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'PROCESS_PAYMENT_ERROR'
    });
  }
});

// @route   GET /api/payment/history
// @desc    Get payment history
// @access  Private
router.get('/history', async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const payments = await dbQueries.query(
      `SELECT p.*, o.order_number, pm.payment_type, pm.last4
       FROM payments p
       JOIN orders o ON p.order_id = o.id
       LEFT JOIN payment_methods pm ON p.payment_method_id = pm.id
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    // Get total count
    const countResult = await dbQueries.query(
      'SELECT COUNT(*) as total FROM payments WHERE user_id = $1',
      [userId]
    );

    const total = parseInt(countResult.rows[0].total);

    res.json({
      payments: payments.rows,
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
    console.error('Get payment history error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_PAYMENT_HISTORY_ERROR'
    });
  }
});

// @route   POST /api/payment/refund
// @desc    Request refund
// @access  Private
router.post('/refund', async (req, res) => {
  try {
    const { order_id, reason } = req.body;
    const userId = req.user.id;

    if (!order_id || !reason) {
      return res.status(400).json({ 
        error: 'Order ID and reason are required',
        code: 'REQUIRED_FIELDS_MISSING'
      });
    }

    // Get order details
    const order = await dbQueries.query(
      'SELECT * FROM orders WHERE id = $1 AND buyer_id = $2',
      [order_id, userId]
    );

    if (order.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Order not found',
        code: 'ORDER_NOT_FOUND'
      });
    }

    // Check if order is eligible for refund
    if (!['delivered', 'cancelled'].includes(order.rows[0].status)) {
      return res.status(400).json({ 
        error: 'Order is not eligible for refund',
        code: 'ORDER_NOT_ELIGIBLE_FOR_REFUND'
      });
    }

    // Check if refund already exists
    const existingRefund = await dbQueries.query(
      'SELECT id FROM refunds WHERE order_id = $1',
      [order_id]
    );

    if (existingRefund.rows.length > 0) {
      return res.status(409).json({ 
        error: 'Refund already requested for this order',
        code: 'REFUND_ALREADY_REQUESTED'
      });
    }

    // Create refund request
    const refund = await dbQueries.query(
      `INSERT INTO refunds (
        order_id, user_id, amount, reason, status
      ) VALUES ($1, $2, $3, $4, 'pending')
      RETURNING *`,
      [order_id, userId, order.rows[0].total, reason]
    );

    res.status(201).json({
      message: 'Refund requested successfully',
      refund: refund.rows[0]
    });
  } catch (error) {
    console.error('Request refund error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'REQUEST_REFUND_ERROR'
    });
  }
});

// @route   GET /api/payment/refunds
// @desc    Get user's refunds
// @access  Private
router.get('/refunds', async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const refunds = await dbQueries.query(
      `SELECT r.*, o.order_number
       FROM refunds r
       JOIN orders o ON r.order_id = o.id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    // Get total count
    const countResult = await dbQueries.query(
      'SELECT COUNT(*) as total FROM refunds WHERE user_id = $1',
      [userId]
    );

    const total = parseInt(countResult.rows[0].total);

    res.json({
      refunds: refunds.rows,
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
    console.error('Get refunds error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_REFUNDS_ERROR'
    });
  }
});

// Mock payment processing function
async function processPayment({ amount, paymentMethod, order }) {
  // This is a simulation - replace with actual payment gateway integration
  return new Promise((resolve) => {
    setTimeout(() => {
      // Simulate 95% success rate
      const success = Math.random() > 0.05;
      
      if (success) {
        resolve({
          success: true,
          payment_id: `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          amount,
          status: 'completed',
          gateway: 'mock_gateway'
        });
      } else {
        resolve({
          success: false,
          error: 'Payment declined by bank'
        });
      }
    }, 1000); // Simulate processing time
  });
}

module.exports = router;