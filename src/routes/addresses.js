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
// routes/addresses.js - Address management routes
const express = require('express');
const router = express.Router();
const { dbQueries, transaction } = require('../config/database');
const { addressSchemas, validate } = require('../validation/schemas');

// @route   GET /api/addresses
// @desc    Get user's addresses
// @access  Private
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    const addresses = await dbQueries.query(
      'SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC',
      [userId]
    );

    res.json({
      addresses: addresses.rows
    });
  } catch (error) {
    console.error('Get addresses error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_ADDRESSES_ERROR'
    });
  }
});

// @route   GET /api/addresses/default
// @desc    Get default address
// @access  Private
router.get('/default', async (req, res) => {
  try {
    const userId = req.user.id;

    const address = await dbQueries.query(
      'SELECT * FROM addresses WHERE user_id = $1 AND is_default = true',
      [userId]
    );

    if (address.rows.length === 0) {
      // Return first address if no default is set
      const firstAddress = await dbQueries.query(
        'SELECT * FROM addresses WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1',
        [userId]
      );

      if (firstAddress.rows.length === 0) {
        return res.status(404).json({ 
          error: 'No addresses found',
          code: 'NO_ADDRESSES_FOUND'
        });
      }

      return res.json({
        address: firstAddress.rows[0]
      });
    }

    res.json({
      address: address.rows[0]
    });
  } catch (error) {
    console.error('Get default address error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_DEFAULT_ADDRESS_ERROR'
    });
  }
});

// @route   GET /api/addresses/recent
// @desc    Get recently used addresses
// @access  Private
router.get('/recent', async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 5;

    // Get addresses used in recent orders
    const addresses = await dbQueries.query(
      `SELECT DISTINCT ON (a.id) a.*, MAX(o.created_at) as last_used
       FROM addresses a
       LEFT JOIN orders o ON (
         a.address_line1 = o.delivery_address_line1 AND
         a.city = o.delivery_city AND
         a.state = o.delivery_state AND
         a.zip_code = o.delivery_zip_code
       )
       WHERE a.user_id = $1
       GROUP BY a.id
       ORDER BY last_used DESC NULLS LAST, a.created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    res.json({
      addresses: addresses.rows
    });
  } catch (error) {
    console.error('Get recent addresses error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_RECENT_ADDRESSES_ERROR'
    });
  }
});

// @route   GET /api/addresses/:id
// @desc    Get single address
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const address = await dbQueries.query(
      'SELECT * FROM addresses WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (address.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Address not found',
        code: 'ADDRESS_NOT_FOUND'
      });
    }

    res.json({
      address: address.rows[0]
    });
  } catch (error) {
    console.error('Get address error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_ADDRESS_ERROR'
    });
  }
});

// @route   POST /api/addresses
// @desc    Create new address
// @access  Private
router.post('/', validate(addressSchemas.create), async (req, res) => {
  try {
    const userId = req.user.id;
    const addressData = { ...req.validatedData, user_id: userId };

    const result = await transaction(async (client) => {
      // If this is set as default, unset other defaults
      if (addressData.is_default) {
        await client.query(
          'UPDATE addresses SET is_default = false WHERE user_id = $1',
          [userId]
        );
      }

      // Insert new address
      const address = await client.query(
        `INSERT INTO addresses (
          user_id, name, address_type, full_name, phone_number, 
          address_line1, address_line2, city, state, zip_code, 
          country, delivery_instructions, is_default
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
        RETURNING *`,
        [
          addressData.user_id, addressData.name, addressData.address_type,
          addressData.full_name, addressData.phone_number, addressData.address_line1,
          addressData.address_line2, addressData.city, addressData.state,
          addressData.zip_code, addressData.country, addressData.delivery_instructions,
          addressData.is_default
        ]
      );

      return address.rows[0];
    });

    res.status(201).json({
      message: 'Address created successfully',
      address: result
    });
  } catch (error) {
    console.error('Create address error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'CREATE_ADDRESS_ERROR'
    });
  }
});

// @route   PUT /api/addresses/:id
// @desc    Update address
// @access  Private
router.put('/:id', validate(addressSchemas.update), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const updateData = req.validatedData;

    // Check if address exists and belongs to user
    const existingAddress = await dbQueries.query(
      'SELECT * FROM addresses WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (existingAddress.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Address not found',
        code: 'ADDRESS_NOT_FOUND'
      });
    }

    const result = await transaction(async (client) => {
      // If this is set as default, unset other defaults
      if (updateData.is_default) {
        await client.query(
          'UPDATE addresses SET is_default = false WHERE user_id = $1 AND id != $2',
          [userId, id]
        );
      }

      // Build update query
      const fields = [];
      const values = [];
      let paramCount = 1;

      Object.entries(updateData).forEach(([key, value]) => {
        if (value !== undefined) {
          fields.push(`${key} = $${paramCount}`);
          values.push(value);
          paramCount++;
        }
      });

      if (fields.length === 0) {
        return existingAddress.rows[0];
      }

      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id, userId);

      const updatedAddress = await client.query(
        `UPDATE addresses SET ${fields.join(', ')} 
         WHERE id = $${paramCount} AND user_id = $${paramCount + 1} 
         RETURNING *`,
        values
      );

      return updatedAddress.rows[0];
    });

    res.json({
      message: 'Address updated successfully',
      address: result
    });
  } catch (error) {
    console.error('Update address error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'UPDATE_ADDRESS_ERROR'
    });
  }
});

// @route   DELETE /api/addresses/:id
// @desc    Delete address
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if address exists and belongs to user
    const existingAddress = await dbQueries.query(
      'SELECT * FROM addresses WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (existingAddress.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Address not found',
        code: 'ADDRESS_NOT_FOUND'
      });
    }

    // Cannot delete if it's the only address
    const addressCount = await dbQueries.query(
      'SELECT COUNT(*) as count FROM addresses WHERE user_id = $1',
      [userId]
    );

    if (parseInt(addressCount.rows[0].count) === 1) {
      return res.status(400).json({ 
        error: 'Cannot delete the only address',
        code: 'CANNOT_DELETE_ONLY_ADDRESS'
      });
    }

    await transaction(async (client) => {
      // Delete address
      await client.query(
        'DELETE FROM addresses WHERE id = $1 AND user_id = $2',
        [id, userId]
      );

      // If deleted address was default, set another as default
      if (existingAddress.rows[0].is_default) {
        await client.query(
          'UPDATE addresses SET is_default = true WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
          [userId]
        );
      }
    });

    res.json({
      message: 'Address deleted successfully'
    });
  } catch (error) {
    console.error('Delete address error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'DELETE_ADDRESS_ERROR'
    });
  }
});

// @route   POST /api/addresses/:id/set-default
// @desc    Set address as default
// @access  Private
router.post('/:id/set-default', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if address exists and belongs to user
    const existingAddress = await dbQueries.query(
      'SELECT * FROM addresses WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (existingAddress.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Address not found',
        code: 'ADDRESS_NOT_FOUND'
      });
    }

    await transaction(async (client) => {
      // Unset all defaults
      await client.query(
        'UPDATE addresses SET is_default = false WHERE user_id = $1',
        [userId]
      );

      // Set this address as default
      await client.query(
        'UPDATE addresses SET is_default = true WHERE id = $1 AND user_id = $2',
        [id, userId]
      );
    });

    res.json({
      message: 'Address set as default successfully'
    });
  } catch (error) {
    console.error('Set default address error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'SET_DEFAULT_ADDRESS_ERROR'
    });
  }
});

// @route   POST /api/addresses/validate
// @desc    Validate address
// @access  Private
router.post('/validate', async (req, res) => {
  try {
    const { address_line1, city, state, zip_code, country } = req.body;

    if (!address_line1 || !city || !state || !zip_code || !country) {
      return res.status(400).json({ 
        error: 'All address fields are required for validation',
        code: 'REQUIRED_FIELDS_MISSING'
      });
    }

    // Basic validation - in production, you'd use a real address validation service
    const validation = {
      valid: true,
      formatted_address: {
        address_line1,
        city,
        state,
        zip_code,
        country
      },
      suggestions: []
    };

    // Simple zip code format validation
    if (country === 'USA' && !/^\d{5}(-\d{4})?$/.test(zip_code)) {
      validation.valid = false;
      validation.errors = ['Invalid ZIP code format'];
    }

    res.json({
      validation
    });
  } catch (error) {
    console.error('Validate address error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'VALIDATE_ADDRESS_ERROR'
    });
  }
});

module.exports = router;