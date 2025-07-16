/* eslint-disable eqeqeq */
/* eslint-disable no-unused-vars */
// routes/categories.js - Category management routes
const express = require('express');
const router = express.Router();
const { dbQueries } = require('../config/database');
const { authenticateToken, authorize } = require('../middleware/auth');
const Joi = require('joi');

// Category validation schemas
const categorySchemas = {
  create: Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    description: Joi.string().trim().max(500).optional(),
    icon: Joi.string().trim().max(100).optional(),
    parent_id: Joi.number().integer().positive().optional()
  }),
  
  update: Joi.object({
    name: Joi.string().trim().min(2).max(100).optional(),
    description: Joi.string().trim().max(500).optional(),
    icon: Joi.string().trim().max(100).optional(),
    parent_id: Joi.number().integer().positive().optional(),
    is_active: Joi.boolean().optional()
  })
};

// Validation middleware
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }
    req.validatedData = value;
    next();
  };
};

// @route   GET /api/categories
// @desc    Get all categories
// @access  Public
router.get('/', async (req, res) => {
  try {
    const includeInactive = req.query.include_inactive === 'true';
    const parentId = req.query.parent_id;

    let queryText = `
      SELECT c.*, 
        (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_active = true) as product_count,
        (SELECT COUNT(*) FROM categories child WHERE child.parent_id = c.id AND child.is_active = true) as subcategory_count
      FROM categories c
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;

    if (!includeInactive) {
      queryText += ' AND c.is_active = true';
    }

    if (parentId) {
      queryText += ` AND c.parent_id = $${paramCount}`;
      params.push(parentId);
      paramCount++;
    } else if (parentId !== 'all') {
      queryText += ' AND c.parent_id IS NULL';
    }

    queryText += ' ORDER BY c.name ASC';

    const result = await dbQueries.query(queryText, params);

    res.json({
      categories: result.rows.map(category => ({
        ...category,
        product_count: parseInt(category.product_count) || 0,
        subcategory_count: parseInt(category.subcategory_count) || 0
      }))
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_CATEGORIES_ERROR'
    });
  }
});

// @route   GET /api/categories/:id
// @desc    Get single category
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await dbQueries.query(
      `SELECT c.*, 
        p.name as parent_name,
        (SELECT COUNT(*) FROM products WHERE category_id = c.id AND is_active = true) as product_count
       FROM categories c
       LEFT JOIN categories p ON c.parent_id = p.id
       WHERE c.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Category not found',
        code: 'CATEGORY_NOT_FOUND'
      });
    }

    // Get subcategories
    const subcategories = await dbQueries.query(
      'SELECT * FROM categories WHERE parent_id = $1 AND is_active = true ORDER BY name ASC',
      [id]
    );

    res.json({
      category: {
        ...result.rows[0],
        product_count: parseInt(result.rows[0].product_count) || 0
      },
      subcategories: subcategories.rows
    });
  } catch (error) {
    console.error('Get category error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_CATEGORY_ERROR'
    });
  }
});

// @route   POST /api/categories
// @desc    Create new category
// @access  Private (Admin only - for now any authenticated user)
router.post('/', authenticateToken, validate(categorySchemas.create), async (req, res) => {
  try {
    const { name, description, icon, parent_id } = req.validatedData;

    // Check if category name already exists
    const existingCategory = await dbQueries.query(
      'SELECT id FROM categories WHERE name = $1 AND parent_id = $2',
      [name, parent_id || null]
    );

    if (existingCategory.rows.length > 0) {
      return res.status(409).json({ 
        error: 'Category with this name already exists',
        code: 'CATEGORY_EXISTS'
      });
    }

    // If parent_id is provided, verify parent exists
    if (parent_id) {
      const parentCategory = await dbQueries.query(
        'SELECT id FROM categories WHERE id = $1 AND is_active = true',
        [parent_id]
      );

      if (parentCategory.rows.length === 0) {
        return res.status(404).json({ 
          error: 'Parent category not found',
          code: 'PARENT_CATEGORY_NOT_FOUND'
        });
      }
    }

    const result = await dbQueries.query(
      'INSERT INTO categories (name, description, icon, parent_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, description, icon, parent_id || null]
    );

    res.status(201).json({
      message: 'Category created successfully',
      category: result.rows[0]
    });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'CREATE_CATEGORY_ERROR'
    });
  }
});

// @route   PUT /api/categories/:id
// @desc    Update category
// @access  Private (Admin only - for now any authenticated user)
router.put('/:id', authenticateToken, validate(categorySchemas.update), async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.validatedData;

    // Check if category exists
    const existingCategory = await dbQueries.query(
      'SELECT * FROM categories WHERE id = $1',
      [id]
    );

    if (existingCategory.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Category not found',
        code: 'CATEGORY_NOT_FOUND'
      });
    }

    // If updating parent_id, verify parent exists and prevent circular reference
    if (updateData.parent_id) {
      const parentCategory = await dbQueries.query(
        'SELECT id FROM categories WHERE id = $1 AND is_active = true',
        [updateData.parent_id]
      );

      if (parentCategory.rows.length === 0) {
        return res.status(404).json({ 
          error: 'Parent category not found',
          code: 'PARENT_CATEGORY_NOT_FOUND'
        });
      }

      // Prevent setting parent to self or child
      if (updateData.parent_id == id) {
        return res.status(400).json({ 
          error: 'Cannot set category as its own parent',
          code: 'CIRCULAR_REFERENCE'
        });
      }
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
      return res.status(400).json({ 
        error: 'No fields to update',
        code: 'NO_UPDATE_FIELDS'
      });
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const result = await dbQueries.query(
      `UPDATE categories SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    res.json({
      message: 'Category updated successfully',
      category: result.rows[0]
    });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'UPDATE_CATEGORY_ERROR'
    });
  }
});

// @route   DELETE /api/categories/:id
// @desc    Delete category (soft delete)
// @access  Private (Admin only - for now any authenticated user)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if category exists
    const existingCategory = await dbQueries.query(
      'SELECT * FROM categories WHERE id = $1',
      [id]
    );

    if (existingCategory.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Category not found',
        code: 'CATEGORY_NOT_FOUND'
      });
    }

    // Check if category has products
    const productCount = await dbQueries.query(
      'SELECT COUNT(*) as count FROM products WHERE category_id = $1 AND is_active = true',
      [id]
    );

    if (parseInt(productCount.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete category with active products',
        code: 'CATEGORY_HAS_PRODUCTS'
      });
    }

    // Check if category has subcategories
    const subcategoryCount = await dbQueries.query(
      'SELECT COUNT(*) as count FROM categories WHERE parent_id = $1 AND is_active = true',
      [id]
    );

    if (parseInt(subcategoryCount.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete category with active subcategories',
        code: 'CATEGORY_HAS_SUBCATEGORIES'
      });
    }

    // Soft delete category
    await dbQueries.query(
      'UPDATE categories SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );

    res.json({
      message: 'Category deleted successfully'
    });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'DELETE_CATEGORY_ERROR'
    });
  }
});

// @route   GET /api/categories/tree/all
// @desc    Get category tree structure
// @access  Public
router.get('/tree/all', async (req, res) => {
  try {
    const result = await dbQueries.query(
      `SELECT c.*, 
        (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_active = true) as product_count
       FROM categories c
       WHERE c.is_active = true
       ORDER BY c.parent_id NULLS FIRST, c.name ASC`
    );

    // Build tree structure
    const categoryMap = new Map();
    const rootCategories = [];

    // First pass: create all category objects
    result.rows.forEach(category => {
      categoryMap.set(category.id, {
        ...category,
        product_count: parseInt(category.product_count) || 0,
        children: []
      });
    });

    // Second pass: build tree structure
    result.rows.forEach(category => {
      const categoryObj = categoryMap.get(category.id);
      
      if (category.parent_id) {
        const parent = categoryMap.get(category.parent_id);
        if (parent) {
          parent.children.push(categoryObj);
        }
      } else {
        rootCategories.push(categoryObj);
      }
    });

    res.json({
      categories: rootCategories
    });
  } catch (error) {
    console.error('Get category tree error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_CATEGORY_TREE_ERROR'
    });
  }
});

module.exports = router;