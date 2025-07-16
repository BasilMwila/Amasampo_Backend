// validation/schemas.js - Joi validation schemas
const Joi = require('joi');

// User validation schemas
const userSchemas = {
  register: Joi.object({
    name: Joi.string().trim().min(2).max(255).required(),
    email: Joi.string().trim().email().required(),
    password: Joi.string().min(8).pattern(new RegExp('^(?=.*[A-Za-z])(?=.*\\d)[A-Za-z\\d@$!%*#?&]{8,}$')).required()
      .messages({
        'string.pattern.base': 'Password must be at least 8 characters long and contain letters and numbers'
      }),
    phone: Joi.string().trim().pattern(/^[+]?[(]?[\d\s\-\(\)]{10,}$/).optional(),
    user_type: Joi.string().valid('buyer', 'seller').required(),
    shop_name: Joi.string().trim().min(2).max(255).when('user_type', {
      is: 'seller',
      then: Joi.required(),
      otherwise: Joi.optional()
    })
  }),

  login: Joi.object({
    email: Joi.string().trim().email().required(),
    password: Joi.string().required()
  }),

  updateProfile: Joi.object({
    name: Joi.string().trim().min(2).max(255).optional(),
    phone: Joi.string().trim().pattern(/^[+]?[(]?[\d\s\-\(\)]{10,}$/).optional(),
    shop_name: Joi.string().trim().min(2).max(255).optional()
  }),

  changePassword: Joi.object({
    current_password: Joi.string().required(),
    new_password: Joi.string().min(8).pattern(new RegExp('^(?=.*[A-Za-z])(?=.*\\d)[A-Za-z\\d@$!%*#?&]{8,}$')).required()
      .messages({
        'string.pattern.base': 'Password must be at least 8 characters long and contain letters and numbers'
      })
  })
};

// Product validation schemas
const productSchemas = {
  create: Joi.object({
    name: Joi.string().trim().min(2).max(255).required(),
    description: Joi.string().trim().min(10).max(1000).required(),
    price: Joi.number().positive().precision(2).required(),
    quantity: Joi.number().integer().min(0).required(),
    category_id: Joi.number().integer().positive().required(),
    image_url: Joi.string().uri().optional(),
    is_featured: Joi.boolean().optional(),
    is_on_sale: Joi.boolean().optional(),
    original_price: Joi.number().positive().precision(2).optional()
  }),

  update: Joi.object({
    name: Joi.string().trim().min(2).max(255).optional(),
    description: Joi.string().trim().min(10).max(1000).optional(),
    price: Joi.number().positive().precision(2).optional(),
    quantity: Joi.number().integer().min(0).optional(),
    category_id: Joi.number().integer().positive().optional(),
    image_url: Joi.string().uri().optional(),
    is_featured: Joi.boolean().optional(),
    is_on_sale: Joi.boolean().optional(),
    original_price: Joi.number().positive().precision(2).optional(),
    is_active: Joi.boolean().optional()
  }),

  search: Joi.object({
    search: Joi.string().trim().max(255).optional(),
    category_id: Joi.number().integer().positive().optional(),
    seller_id: Joi.number().integer().positive().optional(),
    is_featured: Joi.boolean().optional(),
    min_price: Joi.number().positive().precision(2).optional(),
    max_price: Joi.number().positive().precision(2).optional(),
    sort_by: Joi.string().valid('price_asc', 'price_desc', 'name_asc', 'name_desc', 'created_at_desc', 'created_at_asc').optional(),
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional()
  })
};

// Order validation schemas
const orderSchemas = {
  create: Joi.object({
    items: Joi.array().items(
      Joi.object({
        product_id: Joi.number().integer().positive().required(),
        quantity: Joi.number().integer().min(1).required()
      })
    ).min(1).required(),
    delivery_address: Joi.object({
      name: Joi.string().trim().min(2).max(100).required(),
      full_name: Joi.string().trim().min(2).max(255).required(),
      phone: Joi.string().trim().pattern(/^[+]?[(]?[\d\s\-\(\)]{10,}$/).required(),
      address_line1: Joi.string().trim().min(5).max(255).required(),
      address_line2: Joi.string().trim().max(255).optional(),
      city: Joi.string().trim().min(2).max(100).required(),
      state: Joi.string().trim().min(2).max(100).required(),
      zip_code: Joi.string().trim().min(5).max(20).required(),
      country: Joi.string().trim().min(2).max(100).required(),
      delivery_instructions: Joi.string().trim().max(500).optional()
    }).required(),
    payment_method: Joi.object({
      type: Joi.string().valid('credit', 'debit', 'bank', 'paypal', 'apple_pay', 'google_pay').required(),
      last4: Joi.string().length(4).required()
    }).required()
  }),

  updateStatus: Joi.object({
    status: Joi.string().valid('pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled').required(),
    note: Joi.string().trim().max(500).optional()
  })
};

// Cart validation schemas
const cartSchemas = {
  addItem: Joi.object({
    product_id: Joi.number().integer().positive().required(),
    quantity: Joi.number().integer().min(1).required()
  }),

  updateItem: Joi.object({
    quantity: Joi.number().integer().min(1).required()
  })
};

// Review validation schemas
const reviewSchemas = {
  create: Joi.object({
    product_id: Joi.number().integer().positive().required(),
    rating: Joi.number().integer().min(1).max(5).required(),
    title: Joi.string().trim().min(5).max(255).required(),
    comment: Joi.string().trim().min(10).max(1000).required(),
    order_id: Joi.number().integer().positive().optional()
  }),

  update: Joi.object({
    rating: Joi.number().integer().min(1).max(5).optional(),
    title: Joi.string().trim().min(5).max(255).optional(),
    comment: Joi.string().trim().min(10).max(1000).optional()
  })
};

// Message validation schemas
const messageSchemas = {
  send: Joi.object({
    recipient_id: Joi.number().integer().positive().required(),
    message_text: Joi.string().trim().min(1).max(1000).required(),
    message_type: Joi.string().valid('text', 'image', 'product').optional()
  })
};

// Address validation schemas
const addressSchemas = {
  create: Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    address_type: Joi.string().valid('home', 'work', 'other').required(),
    full_name: Joi.string().trim().min(2).max(255).required(),
    phone_number: Joi.string().trim().pattern(/^[+]?[(]?[\d\s\-\(\)]{10,}$/).required(),
    address_line1: Joi.string().trim().min(5).max(255).required(),
    address_line2: Joi.string().trim().max(255).optional(),
    city: Joi.string().trim().min(2).max(100).required(),
    state: Joi.string().trim().min(2).max(100).required(),
    zip_code: Joi.string().trim().min(5).max(20).required(),
    country: Joi.string().trim().min(2).max(100).required(),
    delivery_instructions: Joi.string().trim().max(500).optional(),
    is_default: Joi.boolean().optional()
  }),

  update: Joi.object({
    name: Joi.string().trim().min(2).max(100).optional(),
    address_type: Joi.string().valid('home', 'work', 'other').optional(),
    full_name: Joi.string().trim().min(2).max(255).optional(),
    phone_number: Joi.string().trim().pattern(/^[+]?[(]?[\d\s\-\(\)]{10,}$/).optional(),
    address_line1: Joi.string().trim().min(5).max(255).optional(),
    address_line2: Joi.string().trim().max(255).optional(),
    city: Joi.string().trim().min(2).max(100).optional(),
    state: Joi.string().trim().min(2).max(100).optional(),
    zip_code: Joi.string().trim().min(5).max(20).optional(),
    country: Joi.string().trim().min(2).max(100).optional(),
    delivery_instructions: Joi.string().trim().max(500).optional(),
    is_default: Joi.boolean().optional()
  })
};

// Payment method validation schemas
const paymentSchemas = {
  create: Joi.object({
    payment_type: Joi.string().valid('credit', 'debit', 'bank', 'paypal', 'apple_pay', 'google_pay').required(),
    brand: Joi.string().trim().max(50).optional(),
    last4: Joi.string().length(4).required(),
    expiry_month: Joi.number().integer().min(1).max(12).when('payment_type', {
      is: Joi.valid('credit', 'debit'),
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    expiry_year: Joi.number().integer().min(new Date().getFullYear()).when('payment_type', {
      is: Joi.valid('credit', 'debit'),
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    account_name: Joi.string().trim().max(255).when('payment_type', {
      is: 'bank',
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    email: Joi.string().trim().email().when('payment_type', {
      is: 'paypal',
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    is_default: Joi.boolean().optional()
  })
};

// Validation middleware
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors
      });
    }

    req.validatedData = value;
    next();
  };
};

// Query parameter validation
const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        error: 'Query validation failed',
        code: 'QUERY_VALIDATION_ERROR',
        details: errors
      });
    }

    req.validatedQuery = value;
    next();
  };
};

// Parameter validation
const validateParams = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        error: 'Parameter validation failed',
        code: 'PARAM_VALIDATION_ERROR',
        details: errors
      });
    }

    req.validatedParams = value;
    next();
  };
};

module.exports = {
  userSchemas,
  productSchemas,
  orderSchemas,
  cartSchemas,
  reviewSchemas,
  messageSchemas,
  addressSchemas,
  paymentSchemas,
  validate,
  validateQuery,
  validateParams
};