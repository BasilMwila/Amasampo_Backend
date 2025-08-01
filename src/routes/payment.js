/* eslint-disable linebreak-style */
/* eslint-disable object-shorthand */
/* eslint-disable linebreak-style */
/* eslint-disable no-use-before-define */
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
// routes/payment.js - Payment management routes
// src/routes/payment.js - Complete Lenco Payment Routes Integration
const express = require('express');
const router = express.Router();
const { dbQueries, transaction } = require('../config/database');
const lencoPaymentService = require('../services/lencoPaymentService');

// @route   GET /api/payment/providers
// @desc    Get supported mobile money operators
// @access  Private
router.get('/providers', async (req, res) => {
  try {
    console.log('📱 Fetching supported mobile money operators...');
    
    const operators = lencoPaymentService.getSupportedOperators();
    
    res.json({
      providers: operators
    });
  } catch (error) {
    console.error('Get providers error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_PROVIDERS_ERROR'
    });
  }
});

// @route   POST /api/payment/initialize/card
// @desc    Initialize card payment (returns widget config)
// @access  Private
router.post('/initialize/card', async (req, res) => {
  try {
    const { order_id, success_url, cancel_url } = req.body;
    const userId = req.user.id;

    if (!order_id) {
      return res.status(400).json({ 
        error: 'Order ID is required',
        code: 'REQUIRED_FIELDS_MISSING'
      });
    }

    // Get order details
    const order = await dbQueries.query(
      `SELECT o.*, u.name, u.email, u.phone 
       FROM orders o
       JOIN users u ON o.buyer_id = u.id
       WHERE o.id = $1 AND o.buyer_id = $2`,
      [order_id, userId]
    );

    if (order.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Order not found',
        code: 'ORDER_NOT_FOUND'
      });
    }

    const orderData = order.rows[0];
    const paymentReference = `ORDER_${order_id}_${Date.now()}`;

    // Generate card payment configuration for widget
    const configResult = lencoPaymentService.generateCardPaymentConfig({
      amount: parseFloat(orderData.total),
      currency: 'NGN',
      email: orderData.email,
      phone: orderData.phone,
      firstName: orderData.name.split(' ')[0],
      lastName: orderData.name.split(' ').slice(1).join(' '),
      reference: paymentReference,
      description: `Payment for Order #${orderData.order_number}`,
      onSuccessUrl: success_url || `${process.env.CLIENT_URL}/payment-success`,
      onCloseUrl: cancel_url || `${process.env.CLIENT_URL}/payment-cancelled`
    });

    if (configResult.success) {
      // Store payment record
      await dbQueries.query(
        `INSERT INTO payments (
          user_id, order_id, payment_reference, gateway, payment_method, 
          amount, currency, status, gateway_response
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          userId, order_id, paymentReference, 'lenco', 'card',
          orderData.total, 'NGN', 'pending', JSON.stringify(configResult.config)
        ]
      );

      // Update order with payment reference
      await dbQueries.query(
        'UPDATE orders SET payment_reference = $1, payment_status = $2 WHERE id = $3',
        [paymentReference, 'pending', order_id]
      );

      res.json({
        message: 'Card payment configuration generated successfully',
        data: {
          widget_config: configResult.config,
          widget_script: configResult.widgetScript,
          payment_reference: paymentReference,
          verification_url: `${process.env.API_URL}/api/payment/verify/${paymentReference}`
        }
      });
    } else {
      res.status(400).json({ 
        error: configResult.error,
        code: configResult.code
      });
    }
  } catch (error) {
    console.error('Initialize card payment error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'INITIALIZE_CARD_PAYMENT_ERROR'
    });
  }
});

// @route   POST /api/payment/initialize/mobile-money
// @desc    Initialize mobile money payment
// @access  Private
router.post('/initialize/mobile-money', async (req, res) => {
  try {
    const { order_id, operator, phone, country = 'ng' } = req.body;
    const userId = req.user.id;

    if (!order_id || !operator || !phone) {
      return res.status(400).json({ 
        error: 'Order ID, operator, and phone number are required',
        code: 'REQUIRED_FIELDS_MISSING'
      });
    }

    // Validate phone number format (basic validation)
    if (!/^[0-9+\-\s()]{10,15}$/.test(phone)) {
      return res.status(400).json({ 
        error: 'Invalid phone number format',
        code: 'INVALID_PHONE_NUMBER'
      });
    }

    // Get order details
    const order = await dbQueries.query(
      `SELECT o.*, u.name, u.email 
       FROM orders o
       JOIN users u ON o.buyer_id = u.id
       WHERE o.id = $1 AND o.buyer_id = $2`,
      [order_id, userId]
    );

    if (order.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Order not found',
        code: 'ORDER_NOT_FOUND'
      });
    }

    const orderData = order.rows[0];
    const paymentReference = `ORDER_${order_id}_${Date.now()}`;

    // Initialize mobile money payment with Lenco
    const paymentResult = await lencoPaymentService.initializeMobileMoneyPayment({
      amount: parseFloat(orderData.total),
      currency: 'NGN',
      phone: phone,
      reference: paymentReference,
      description: `Payment for Order #${orderData.order_number}`,
      country: country,
      operator: operator,
      bearer: 'merchant'
    });

    if (paymentResult.success) {
      // Store payment record
      await dbQueries.query(
        `INSERT INTO payments (
          user_id, order_id, payment_reference, gateway, payment_method, 
          amount, currency, status, gateway_response, provider, lenco_reference
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          userId, order_id, paymentReference, 'lenco', 'mobile_money',
          orderData.total, 'NGN', paymentResult.data.status, 
          JSON.stringify(paymentResult.data), operator, paymentResult.data.lencoReference
        ]
      );

      // Update order with payment reference
      await dbQueries.query(
        'UPDATE orders SET payment_reference = $1, payment_status = $2 WHERE id = $3',
        [paymentReference, 'pending', order_id]
      );

      res.json({
        message: 'Mobile money payment initialized successfully',
        data: {
          reference: paymentResult.data.reference,
          lenco_reference: paymentResult.data.lencoReference,
          status: paymentResult.data.status,
          instructions: paymentResult.data.instructions,
          operator: paymentResult.data.operator,
          amount: paymentResult.data.amount,
          currency: paymentResult.data.currency,
          collection_id: paymentResult.data.id,
          needs_otp: paymentResult.data.status === 'otp-required',
          needs_authorization: paymentResult.data.status === 'pay-offline'
        }
      });
    } else {
      res.status(400).json({ 
        error: paymentResult.error,
        code: paymentResult.code
      });
    }
  } catch (error) {
    console.error('Initialize mobile money payment error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'INITIALIZE_MOBILE_MONEY_PAYMENT_ERROR'
    });
  }
});

// @route   POST /api/payment/mobile-money/submit-otp
// @desc    Submit OTP for mobile money payment
// @access  Private
router.post('/mobile-money/submit-otp', async (req, res) => {
  try {
    const { collection_id, otp } = req.body;
    const userId = req.user.id;

    if (!collection_id || !otp) {
      return res.status(400).json({ 
        error: 'Collection ID and OTP are required',
        code: 'REQUIRED_FIELDS_MISSING'
      });
    }

    // Verify this collection belongs to the user
    const payment = await dbQueries.query(
      `SELECT p.*, o.buyer_id 
       FROM payments p
       JOIN orders o ON p.order_id = o.id
       WHERE JSON_EXTRACT(p.gateway_response, '$.id') = $1 AND o.buyer_id = $2`,
      [collection_id, userId]
    );

    if (payment.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Collection not found or unauthorized',
        code: 'COLLECTION_NOT_FOUND'
      });
    }

    // Submit OTP to Lenco
    const otpResult = await lencoPaymentService.submitMobileMoneyOTP(collection_id, otp);

    if (otpResult.success) {
      // Update payment status
      await dbQueries.query(
        `UPDATE payments SET 
          status = $1, 
          gateway_response = JSON_SET(gateway_response, '$.status', $1),
          updated_at = CURRENT_TIMESTAMP
         WHERE JSON_EXTRACT(gateway_response, '$.id') = $2`,
        [otpResult.data.status, collection_id]
      );

      res.json({
        message: 'OTP submitted successfully',
        data: {
          status: otpResult.data.status,
          reference: otpResult.data.reference,
          message: otpResult.data.message
        }
      });
    } else {
      res.status(400).json({ 
        error: otpResult.error,
        code: otpResult.code
      });
    }
  } catch (error) {
    console.error('Submit mobile money OTP error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'SUBMIT_MOBILE_MONEY_OTP_ERROR'
    });
  }
});

// @route   GET /api/payment/verify/:reference
// @desc    Verify payment status
// @access  Private
router.get('/verify/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    const userId = req.user.id;

    console.log('🔍 Verifying payment:', reference);

    // Get local payment record
    const localPayment = await dbQueries.query(
      `SELECT p.*, o.buyer_id 
       FROM payments p
       JOIN orders o ON p.order_id = o.id
       WHERE p.payment_reference = $1 AND o.buyer_id = $2`,
      [reference, userId]
    );

    if (localPayment.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Payment not found',
        code: 'PAYMENT_NOT_FOUND'
      });
    }

    // Verify with Lenco
    const verificationResult = await lencoPaymentService.verifyPayment(reference);

    if (verificationResult.success) {
      const paymentData = verificationResult.data;
      
      // Update local payment record
      await transaction(async (client) => {
        // Update payment status
        await client.query(
          `UPDATE payments SET 
            status = $1, 
            paid_at = $2, 
            gateway_response = $3,
            fees = $4,
            lenco_reference = $5,
            updated_at = CURRENT_TIMESTAMP
           WHERE payment_reference = $6`,
          [
            paymentData.status,
            paymentData.completedAt,
            JSON.stringify(paymentData),
            paymentData.fee,
            paymentData.lencoReference,
            reference
          ]
        );

        // Update order status if payment successful
        if (paymentData.status === 'successful') {
          await client.query(
            'UPDATE orders SET status = $1, payment_status = $2 WHERE payment_reference = $3',
            ['confirmed', 'paid', reference]
          );

          // Add to order status history
          const order = await client.query(
            'SELECT id FROM orders WHERE payment_reference = $1',
            [reference]
          );

          if (order.rows.length > 0) {
            await client.query(
              'INSERT INTO order_status_history (order_id, status, note) VALUES ($1, $2, $3)',
              [order.rows[0].id, 'confirmed', 'Payment confirmed via Lenco']
            );
          }
        }
      });

      res.json({
        message: 'Payment verification completed',
        data: {
          reference: paymentData.reference,
          lenco_reference: paymentData.lencoReference,
          status: paymentData.status,
          amount: paymentData.amount,
          currency: paymentData.currency,
          type: paymentData.type,
          completed_at: paymentData.completedAt,
          settlement_status: paymentData.settlementStatus,
          mobile_money_details: paymentData.mobileMoneyDetails,
          card_details: paymentData.cardDetails
        }
      });
    } else {
      res.status(400).json({ 
        error: verificationResult.error,
        code: verificationResult.code
      });
    }
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'VERIFY_PAYMENT_ERROR'
    });
  }
});

// @route   POST /api/payment/webhook/lenco
// @desc    Handle Lenco webhook notifications
// @access  Public (no auth required for webhooks)
router.post('/webhook/lenco', async (req, res) => {
  try {
    const payload = req.body;

    console.log('📥 Received Lenco webhook:', payload.event || 'unknown event');

    // Log webhook for debugging
    await dbQueries.query(
      `INSERT INTO payment_webhook_logs (
        payment_reference, webhook_event, payload, status
      ) VALUES ($1, $2, $3, $4)`,
      [
        payload.data?.reference || 'unknown',
        payload.event || 'unknown',
        JSON.stringify(payload),
        'received'
      ]
    );

    // Process webhook
    const webhookData = lencoPaymentService.processWebhook(payload);
    
    if (!webhookData.success) {
      await dbQueries.query(
        `UPDATE payment_webhook_logs 
         SET status = $1, error_message = $2 
         WHERE payload->>'$.data.reference' = $3 
         ORDER BY created_at DESC LIMIT 1`,
        ['failed', webhookData.error, payload.data?.reference || 'unknown']
      );

      return res.status(400).json({ error: webhookData.error });
    }

    // Update payment status based on webhook
    await transaction(async (client) => {
      // Update payment record
      const updateResult = await client.query(
        `UPDATE payments SET 
          status = $1, 
          paid_at = $2, 
          lenco_reference = $3,
          gateway_response = $4,
          updated_at = CURRENT_TIMESTAMP
         WHERE payment_reference = $5`,
        [
          webhookData.status,
          webhookData.completed_at,
          webhookData.lenco_reference,
          JSON.stringify(webhookData),
          webhookData.payment_reference
        ]
      );

      // Update order if payment successful
      if (webhookData.status === 'successful' && updateResult.rowCount > 0) {
        await client.query(
          'UPDATE orders SET status = $1, payment_status = $2 WHERE payment_reference = $3',
          ['confirmed', 'paid', webhookData.payment_reference]
        );

        // Add order status history
        const order = await client.query(
          'SELECT id FROM orders WHERE payment_reference = $1',
          [webhookData.payment_reference]
        );

        if (order.rows.length > 0) {
          await client.query(
            'INSERT INTO order_status_history (order_id, status, note) VALUES ($1, $2, $3)',
            [order.rows[0].id, 'confirmed', `Payment confirmed via ${webhookData.type} (Lenco webhook)`]
          );
        }

        console.log('✅ Payment confirmed via webhook:', webhookData.payment_reference);
      }

      // Mark webhook as processed
      await client.query(
        `UPDATE payment_webhook_logs 
         SET status = 'processed' 
         WHERE payload->>'$.data.reference' = $1 
         ORDER BY created_at DESC LIMIT 1`,
        [webhookData.payment_reference]
      );
    });

    res.json({ message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('Webhook processing error:', error);
    
    // Log error
    await dbQueries.query(
      `UPDATE payment_webhook_logs 
       SET status = $1, error_message = $2 
       WHERE payload->>'$.data.reference' = $3 
       ORDER BY created_at DESC LIMIT 1`,
      ['failed', error.message, req.body.data?.reference || 'unknown']
    );

    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// @route   GET /api/payment/status/:order_id
// @desc    Get payment status for an order
// @access  Private
router.get('/status/:order_id', async (req, res) => {
  try {
    const { order_id } = req.params;
    const userId = req.user.id;

    const payment = await dbQueries.query(
      `SELECT p.*, o.order_number, o.total as order_total
       FROM payments p
       JOIN orders o ON p.order_id = o.id
       WHERE p.order_id = $1 AND o.buyer_id = $2
       ORDER BY p.created_at DESC
       LIMIT 1`,
      [order_id, userId]
    );

    if (payment.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Payment not found',
        code: 'PAYMENT_NOT_FOUND'
      });
    }

    const paymentData = payment.rows[0];

    res.json({
      payment: {
        id: paymentData.id,
        reference: paymentData.payment_reference,
        lenco_reference: paymentData.lenco_reference,
        status: paymentData.status,
        amount: parseFloat(paymentData.amount),
        currency: paymentData.currency,
        payment_method: paymentData.payment_method,
        provider: paymentData.provider,
        gateway: paymentData.gateway,
        fees: parseFloat(paymentData.fees || 0),
        paid_at: paymentData.paid_at,
        created_at: paymentData.created_at,
        order_number: paymentData.order_number,
        gateway_response: paymentData.gateway_response
      }
    });
  } catch (error) {
    console.error('Get payment status error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_PAYMENT_STATUS_ERROR'
    });
  }
});

// @route   GET /api/payment/test-connection
// @desc    Test Lenco API connection
// @access  Private (for debugging)
router.get('/test-connection', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Not available in production' });
    }

    const result = await lencoPaymentService.testConnection();
    
    res.json({
      message: 'Connection test completed',
      data: result
    });
  } catch (error) {
    console.error('Test connection error:', error);
    res.status(500).json({ 
      error: 'Connection test failed',
      details: error.message
    });
  }
});

// Keep existing payment methods routes from original implementation
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

// @route   POST /api/payment/methods
// @desc    Add new payment method
// @access  Private
router.post('/methods', async (req, res) => {
  try {
    const userId = req.user.id;
    const paymentData = { ...req.body, user_id: userId };

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

module.exports = router;