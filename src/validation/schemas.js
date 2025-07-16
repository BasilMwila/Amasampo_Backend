/* eslint-disable linebreak-style */
/* eslint-disable comma-dangle */
/* eslint-disable linebreak-style */
/* eslint-disable newline-per-chained-call */
/* eslint-disable linebreak-style */
// validation/schemas.js - Simplified validation schemas
const Joi = require('joi');

// User validation schemas
const userSchemas = {
  register: Joi.object({
    name: Joi.string().trim().min(2).max(255).required(),
    email: Joi.string().trim().email().required(),
    password: Joi.string().min(8).required(),
    phone: Joi.string().optional(),
    user_type: Joi.string().valid('buyer', 'seller').required(),
    shop_name: Joi.string().optional()
  }),

  login: Joi.object({
    email: Joi.string().trim().email().required(),
    password: Joi.string().required()
  }),

  updateProfile: Joi.object({
    name: Joi.string().trim().min(2).max(255).optional(),
    phone: Joi.string().optional(),
    shop_name: Joi.string().optional()
  }),

  changePassword: Joi.object({
    current_password: Joi.string().required(),
    new_password: Joi.string().min(8).required()
  })
};

// Product validation schemas
const productSchemas = {
  create: Joi.object({
    name: Joi.string().trim().min(2).max(255).required(),
    description: Joi.string().trim().min(10).required(),
    price: Joi.number().positive().required(),
    quantity: Joi.number().integer().min(0).required(),
    category_id: Joi.number().integer().positive().required(),
    image_url: Joi.string().optional()
  }),

  update: Joi.object({
    name: Joi.string().trim().min(2).max(255).optional(),
    description: Joi.string().trim().min(10).optional(),
    price: Joi.number().positive().optional(),
    quantity: Joi.number().integer().min(0).optional(),
    category_id: Joi.number().integer().positive().optional(),
    image_url: Joi.string().optional()
  }),

  search: Joi.object({
    search: Joi.string().optional(),
    category_id: Joi.number().integer().positive().optional(),
    seller_id: Joi.number().integer().positive().optional(),
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
    ).required(),
    delivery_address: Joi.object().required(),
    payment_method: Joi.object().required()
  }),

  updateStatus: Joi.object({
    status: Joi.string().required(),
    note: Joi.string().optional()
  })
};

// Address validation schemas
const addressSchemas = {
  create: Joi.object({
    name: Joi.string().required(),
    full_name: Joi.string().required(),
    phone_number: Joi.string().required(),
    address_line1: Joi.string().required(),
    address_line2: Joi.string().optional(),
    city: Joi.string().required(),
    state: Joi.string().required(),
    zip_code: Joi.string().required(),
    country: Joi.string().required(),
    is_default: Joi.boolean().optional()
  }),

  update: Joi.object({
    name: Joi.string().optional(),
    full_name: Joi.string().optional(),
    phone_number: Joi.string().optional(),
    address_line1: Joi.string().optional(),
    city: Joi.string().optional(),
    state: Joi.string().optional(),
    zip_code: Joi.string().optional(),
    country: Joi.string().optional(),
    is_default: Joi.boolean().optional()
  })
};

// Payment schemas
const paymentSchemas = {
  create: Joi.object({
    payment_type: Joi.string().required(),
    last4: Joi.string().required(),
    brand: Joi.string().optional(),
    is_default: Joi.boolean().optional()
  })
};

// Cart schemas
const cartSchemas = {
  addItem: Joi.object({
    product_id: Joi.number().integer().positive().required(),
    quantity: Joi.number().integer().min(1).required()
  }),

  updateItem: Joi.object({
    quantity: Joi.number().integer().min(1).required()
  })
};

// Review schemas
const reviewSchemas = {
  create: Joi.object({
    product_id: Joi.number().integer().positive().required(),
    rating: Joi.number().integer().min(1).max(5).required(),
    title: Joi.string().required(),
    comment: Joi.string().required()
  }),

  update: Joi.object({
    rating: Joi.number().integer().min(1).max(5).optional(),
    title: Joi.string().optional(),
    comment: Joi.string().optional()
  })
};

// Message schemas
const messageSchemas = {
  send: Joi.object({
    recipient_id: Joi.number().integer().positive().required(),
    message_text: Joi.string().required()
  })
};

// Validation middleware
const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errors = error.details.map((detail) => ({
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

// Query validation
const validateQuery = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.query, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errors = error.details.map((detail) => ({
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

module.exports = {
  userSchemas,
  productSchemas,
  orderSchemas,
  addressSchemas,
  paymentSchemas,
  cartSchemas,
  reviewSchemas,
  messageSchemas,
  validate,
  validateQuery
};
