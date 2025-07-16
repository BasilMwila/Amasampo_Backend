// routes/cart.js - Shopping cart routes
const express = require('express');
const router = express.Router();
const { dbQueries } = require('../config/database');
const { authenticateToken, authorize } = require('../middleware/auth');
const { cartSchemas, validate } = require('../validation/schemas');

// @route   GET /api/cart
// @desc    Get user's cart items
// @access  Private (Buyers only)
router.get('/', authenticateToken, authorize('buyer'), async (req, res) => {
  try {
    const userId = req.user.id;

    const cartItems = await dbQueries.getCartItems(userId);

    // Calculate totals
    const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

    res.json({
      cart_items: cartItems,
      summary: {
        total_items: totalItems,
        subtotal: subtotal.toFixed(2),
        estimated_delivery_fee: 2.50,
        estimated_service_fee: (subtotal * 0.03).toFixed(2),
        estimated_total: (subtotal + 2.50 + (subtotal * 0.03)).toFixed(2)
      }
    });
  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_CART_ERROR'
    });
  }
});

// @route   POST /api/cart/add
// @desc    Add item to cart
// @access  Private (Buyers only)
router.post('/add', authenticateToken, authorize('buyer'), validate(cartSchemas.addItem), async (req, res) => {
  try {
    const { product_id, quantity } = req.validatedData;
    const userId = req.user.id;

    // Check if product exists and is active
    const product = await dbQueries.getProductById(product_id);
    if (!product) {
      return res.status(404).json({ 
        error: 'Product not found',
        code: 'PRODUCT_NOT_FOUND'
      });
    }

    // Check if user is trying to add their own product
    if (product.seller_id === userId) {
      return res.status(400).json({ 
        error: 'Cannot add your own product to cart',
        code: 'CANNOT_ADD_OWN_PRODUCT'
      });
    }

    // Check if product has enough quantity
    if (product.quantity < quantity) {
      return res.status(400).json({ 
        error: `Only ${product.quantity} items available`,
        code: 'INSUFFICIENT_QUANTITY'
      });
    }

    // Check if item already exists in cart
    const existingItem = await dbQueries.query(
      'SELECT * FROM cart_items WHERE user_id = $1 AND product_id = $2',
      [userId, product_id]
    );

    if (existingItem.rows.length > 0) {
      const currentQuantity = existingItem.rows[0].quantity;
      const newQuantity = currentQuantity + quantity;

      // Check if new quantity exceeds available stock
      if (newQuantity > product.quantity) {
        return res.status(400).json({ 
          error: `Cannot add ${quantity} more items. Only ${product.quantity - currentQuantity} more available`,
          code: 'INSUFFICIENT_QUANTITY'
        });
      }

      // Update existing item
      const updatedItem = await dbQueries.updateCartItem(userId, product_id, newQuantity);
      
      res.json({
        message: 'Cart item updated successfully',
        cart_item: updatedItem
      });
    } else {
      // Add new item to cart
      const cartItem = await dbQueries.addToCart(userId, product_id, quantity);
      
      res.status(201).json({
        message: 'Item added to cart successfully',
        cart_item: cartItem
      });
    }
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'ADD_TO_CART_ERROR'
    });
  }
});

// @route   PUT /api/cart/update/:productId
// @desc    Update cart item quantity
// @access  Private (Buyers only)
router.put('/update/:productId', authenticateToken, authorize('buyer'), validate(cartSchemas.updateItem), async (req, res) => {
  try {
    const { productId } = req.params;
    const { quantity } = req.validatedData;
    const userId = req.user.id;

    // Check if product exists and is active
    const product = await dbQueries.getProductById(productId);
    if (!product) {
      return res.status(404).json({ 
        error: 'Product not found',
        code: 'PRODUCT_NOT_FOUND'
      });
    }

    // Check if product has enough quantity
    if (product.quantity < quantity) {
      return res.status(400).json({ 
        error: `Only ${product.quantity} items available`,
        code: 'INSUFFICIENT_QUANTITY'
      });
    }

    // Check if item exists in cart
    const existingItem = await dbQueries.query(
      'SELECT * FROM cart_items WHERE user_id = $1 AND product_id = $2',
      [userId, productId]
    );

    if (existingItem.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Item not found in cart',
        code: 'CART_ITEM_NOT_FOUND'
      });
    }

    // Update cart item
    const updatedItem = await dbQueries.updateCartItem(userId, productId, quantity);

    res.json({
      message: 'Cart item updated successfully',
      cart_item: updatedItem
    });
  } catch (error) {
    console.error('Update cart item error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'UPDATE_CART_ITEM_ERROR'
    });
  }
});

// @route   DELETE /api/cart/remove/:productId
// @desc    Remove item from cart
// @access  Private (Buyers only)
router.delete('/remove/:productId', authenticateToken, authorize('buyer'), async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user.id;

    const removed = await dbQueries.removeFromCart(userId, productId);

    if (!removed) {
      return res.status(404).json({ 
        error: 'Item not found in cart',
        code: 'CART_ITEM_NOT_FOUND'
      });
    }

    res.json({
      message: 'Item removed from cart successfully'
    });
  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'REMOVE_FROM_CART_ERROR'
    });
  }
});

// @route   DELETE /api/cart/clear
// @desc    Clear all items from cart
// @access  Private (Buyers only)
router.delete('/clear', authenticateToken, authorize('buyer'), async (req, res) => {
  try {
    const userId = req.user.id;

    const removedCount = await dbQueries.clearCart(userId);

    res.json({
      message: 'Cart cleared successfully',
      removed_items: removedCount
    });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'CLEAR_CART_ERROR'
    });
  }
});

// @route   GET /api/cart/count
// @desc    Get cart items count
// @access  Private (Buyers only)
router.get('/count', authenticateToken, authorize('buyer'), async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await dbQueries.query(
      'SELECT SUM(quantity) as total_items FROM cart_items WHERE user_id = $1',
      [userId]
    );

    const totalItems = parseInt(result.rows[0].total_items) || 0;

    res.json({
      total_items: totalItems
    });
  } catch (error) {
    console.error('Get cart count error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_CART_COUNT_ERROR'
    });
  }
});

// @route   POST /api/cart/validate
// @desc    Validate cart items (check availability, prices, etc.)
// @access  Private (Buyers only)
router.post('/validate', authenticateToken, authorize('buyer'), async (req, res) => {
  try {
    const userId = req.user.id;

    const cartItems = await dbQueries.getCartItems(userId);

    const validation = {
      valid: true,
      issues: [],
      updated_items: []
    };

    for (const item of cartItems) {
      const product = await dbQueries.getProductById(item.product_id);

      if (!product) {
        validation.valid = false;
        validation.issues.push({
          product_id: item.product_id,
          product_name: item.name,
          issue: 'Product no longer available',
          action: 'remove'
        });
        
        // Remove unavailable product from cart
        await dbQueries.removeFromCart(userId, item.product_id);
        continue;
      }

      // Check if price changed
      if (parseFloat(product.price) !== parseFloat(item.price)) {
        validation.updated_items.push({
          product_id: item.product_id,
          product_name: item.name,
          old_price: item.price,
          new_price: product.price,
          change: 'price_updated'
        });
      }

      // Check if quantity is still available
      if (item.quantity > product.quantity) {
        validation.valid = false;
        validation.issues.push({
          product_id: item.product_id,
          product_name: item.name,
          issue: `Only ${product.quantity} items available, you have ${item.quantity} in cart`,
          action: 'reduce_quantity',
          available_quantity: product.quantity
        });

        // Update cart item to available quantity
        if (product.quantity > 0) {
          await dbQueries.updateCartItem(userId, item.product_id, product.quantity);
        } else {
          await dbQueries.removeFromCart(userId, item.product_id);
        }
      }
    }

    res.json({
      validation_result: validation
    });
  } catch (error) {
    console.error('Validate cart error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'VALIDATE_CART_ERROR'
    });
  }
});

// @route   POST /api/cart/move-to-wishlist/:productId
// @desc    Move item from cart to wishlist
// @access  Private (Buyers only)
router.post('/move-to-wishlist/:productId', authenticateToken, authorize('buyer'), async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user.id;

    // Check if item exists in cart
    const cartItem = await dbQueries.query(
      'SELECT * FROM cart_items WHERE user_id = $1 AND product_id = $2',
      [userId, productId]
    );

    if (cartItem.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Item not found in cart',
        code: 'CART_ITEM_NOT_FOUND'
      });
    }

    // Add to wishlist (if not already there)
    await dbQueries.query(
      'INSERT INTO wishlist (user_id, product_id) VALUES ($1, $2) ON CONFLICT (user_id, product_id) DO NOTHING',
      [userId, productId]
    );

    // Remove from cart
    await dbQueries.removeFromCart(userId, productId);

    res.json({
      message: 'Item moved to wishlist successfully'
    });
  } catch (error) {
    console.error('Move to wishlist error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'MOVE_TO_WISHLIST_ERROR'
    });
  }
});

// @route   GET /api/cart/similar-products/:productId
// @desc    Get similar products for cart item
// @access  Private (Buyers only)
router.get('/similar-products/:productId', authenticateToken, authorize('buyer'), async (req, res) => {
  try {
    const { productId } = req.params;
    const limit = req.query.limit || 5;

    // Get product details
    const product = await dbQueries.getProductById(productId);
    if (!product) {
      return res.status(404).json({ 
        error: 'Product not found',
        code: 'PRODUCT_NOT_FOUND'
      });
    }

    // Get similar products (same category, different seller)
    const similarProducts = await dbQueries.query(
      `SELECT p.*, u.name as seller_name, u.shop_name
       FROM products p
       JOIN users u ON p.seller_id = u.id
       WHERE p.category_id = $1 
       AND p.id != $2 
       AND p.is_active = true
       AND p.seller_id != $3
       ORDER BY p.rating DESC, p.created_at DESC
       LIMIT $4`,
      [product.category_id, productId, product.seller_id, limit]
    );

    res.json({
      similar_products: similarProducts.rows
    });
  } catch (error) {
    console.error('Get similar products error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_SIMILAR_PRODUCTS_ERROR'
    });
  }
});

module.exports = router;