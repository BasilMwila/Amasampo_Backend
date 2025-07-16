/* eslint-disable no-unused-vars */
// middleware/auth.js - Authentication middleware
const jwt = require('jsonwebtoken');
const { dbQueries } = require('../config/database');

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      userType: user.user_type 
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// Generate refresh token
const generateRefreshToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email 
    },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );
};

// Verify JWT token
const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

// Verify refresh token
const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ 
      error: 'Access token required',
      code: 'TOKEN_REQUIRED'
    });
  }

  try {
    const decoded = verifyToken(token);
    
    // Get user from database to ensure they still exist and are active
    const user = await dbQueries.findUserById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ 
        error: 'Invalid token - user not found',
        code: 'INVALID_TOKEN'
      });
    }

    if (!user.is_active) {
      return res.status(401).json({ 
        error: 'Account is deactivated',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }
    
    return res.status(500).json({ 
      error: 'Token verification failed',
      code: 'TOKEN_VERIFICATION_FAILED'
    });
  }
};

// Authorization middleware - check user type
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    if (!roles.includes(req.user.user_type)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    next();
  };
};

// Optional authentication middleware - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = verifyToken(token);
    const user = await dbQueries.findUserById(decoded.id);
    
    if (user && user.is_active) {
      req.user = user;
    } else {
      req.user = null;
    }
  } catch (error) {
    req.user = null;
  }

  next();
};

// Check if user owns resource
const checkResourceOwnership = (resourceUserIdField = 'user_id') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const resourceUserId = req.body[resourceUserIdField] || 
                          req.params[resourceUserIdField] || 
                          req.query[resourceUserIdField];

    if (!resourceUserId) {
      return res.status(400).json({ 
        error: 'Resource user ID not provided',
        code: 'RESOURCE_USER_ID_REQUIRED'
      });
    }

    if (req.user.id !== parseInt(resourceUserId)) {
      return res.status(403).json({ 
        error: 'Access denied - not resource owner',
        code: 'NOT_RESOURCE_OWNER'
      });
    }

    next();
  };
};

// Check if user is seller of product
const checkProductOwnership = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  const productId = req.params.id || req.body.product_id;
  
  if (!productId) {
    return res.status(400).json({ 
      error: 'Product ID required',
      code: 'PRODUCT_ID_REQUIRED'
    });
  }

  try {
    const product = await dbQueries.getProductById(productId);
    
    if (!product) {
      return res.status(404).json({ 
        error: 'Product not found',
        code: 'PRODUCT_NOT_FOUND'
      });
    }

    if (product.seller_id !== req.user.id) {
      return res.status(403).json({ 
        error: 'Access denied - not product owner',
        code: 'NOT_PRODUCT_OWNER'
      });
    }

    req.product = product;
    next();
  } catch (error) {
    console.error('Product ownership check error:', error);
    return res.status(500).json({ 
      error: 'Failed to verify product ownership',
      code: 'OWNERSHIP_CHECK_FAILED'
    });
  }
};

// Rate limiting for authentication endpoints
const authRateLimit = require('express-rate-limit')({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    error: 'Too many authentication attempts, please try again later',
    code: 'TOO_MANY_ATTEMPTS'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  generateToken,
  generateRefreshToken,
  verifyToken,
  verifyRefreshToken,
  authenticateToken,
  authorize,
  optionalAuth,
  checkResourceOwnership,
  checkProductOwnership,
  authRateLimit
};

// utils/password.js - Password hashing utilities
const bcrypt = require('bcryptjs');

const hashPassword = async (password) => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

const validatePassword = (password) => {
  // At least 8 characters, contains letters and numbers
  const regex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/;
  return regex.test(password);
};

module.exports = {
  hashPassword,
  comparePassword,
  validatePassword
};