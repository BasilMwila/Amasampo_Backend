/* eslint-disable linebreak-style */
/* eslint-disable no-trailing-spaces */
/* eslint-disable linebreak-style */
/* eslint-disable eol-last */
/* eslint-disable operator-linebreak */
/* eslint-disable comma-dangle */
/* eslint-disable arrow-body-style */
/* eslint-disable linebreak-style */
// src/middleware/auth.js - Updated authentication middleware with blacklist support
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { dbQueries } = require('../config/database');
const { tokenBlacklist } = require('../utils/tokenBlacklist');

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

// Authentication middleware with blacklist support
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      error: 'Access token required',
      code: 'TOKEN_REQUIRED'
    });
  }

  try {
    // Check if token is blacklisted
    if (tokenBlacklist.isBlacklisted(token)) {
      return res.status(401).json({
        error: 'Token has been revoked',
        code: 'TOKEN_REVOKED'
      });
    }

    const decoded = verifyToken(token);
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

    // Add token to request for potential blacklisting in logout
    req.token = token;
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

// Optional authentication middleware for logout (allows expired/invalid tokens)
const optionalAuthForLogout = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // No token provided - treat as anonymous logout
    req.token = null;
    req.user = null;
    return next();
  }

  try {
    // Try to decode token without verification for blacklisting purposes
    const decoded = jwt.decode(token);
    
    if (decoded && decoded.id) {
      try {
        // Try to get user info if token is still valid
        const user = await dbQueries.findUserById(decoded.id);
        req.user = user;
      } catch (userError) {
        // User lookup failed, but we can still blacklist the token
        req.user = null;
      }
    }

    // Always add token for blacklisting, even if invalid/expired
    req.token = token;
    next();
  } catch (error) {
    // Token is malformed, but we can still add it to blacklist
    req.token = token;
    req.user = null;
    next();
  }
};

// Authorization middleware
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

// Optional authentication middleware
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    // Check if token is blacklisted
    if (tokenBlacklist.isBlacklisted(token)) {
      req.user = null;
      return next();
    }

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

// Check resource ownership
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

    if (req.user.id !== parseInt(resourceUserId, 10)) {
      return res.status(403).json({
        error: 'Access denied - not resource owner',
        code: 'NOT_RESOURCE_OWNER'
      });
    }

    next();
  };
};

// Check product ownership
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

// Rate limiting for auth endpoints
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    error: 'Too many authentication attempts, please try again later',
    code: 'TOO_MANY_ATTEMPTS'
  },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = {
  generateToken,
  generateRefreshToken,
  verifyToken,
  verifyRefreshToken,
  authenticateToken,
  optionalAuthForLogout,
  authorize,
  optionalAuth,
  checkResourceOwnership,
  checkProductOwnership,
  authRateLimit
};