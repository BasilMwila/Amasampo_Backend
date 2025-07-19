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
// routes/auth.js - Updated authentication routes with proper logout
const express = require('express');
const router = express.Router();
const { dbQueries } = require('../config/database');
const { hashPassword, comparePassword } = require('../utils/password');
const { 
  generateToken, 
  generateRefreshToken, 
  verifyRefreshToken, 
  authenticateToken,
  optionalAuthForLogout,
  authRateLimit 
} = require('../middleware/auth');
const { userSchemas, validate } = require('../validation/schemas');
const { tokenBlacklist } = require('../utils/tokenBlacklist');

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', authRateLimit, validate(userSchemas.register), async (req, res) => {
  try {
    const { name, email, password, phone, user_type, shop_name } = req.validatedData;

    // Check if user already exists
    const existingUser = await dbQueries.findUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ 
        error: 'User with this email already exists',
        code: 'EMAIL_ALREADY_EXISTS'
      });
    }

    // Hash password
    const password_hash = await hashPassword(password);

    // Create user
    const userData = {
      name,
      email,
      password_hash,
      phone,
      user_type,
      shop_name: user_type === 'seller' ? shop_name : null
    };

    const user = await dbQueries.createUser(userData);

    // Generate tokens
    const accessToken = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    // Create default settings for the user
    try {
      await dbQueries.createUserSettings(user.id);
    } catch (settingsError) {
      console.warn('Failed to create user settings:', settingsError.message);
      // Continue without failing the registration
    }

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        uuid: user.uuid,
        name: user.name,
        email: user.email,
        phone: user.phone,
        user_type: user.user_type,
        shop_name: user.shop_name,
        created_at: user.created_at
      },
      tokens: {
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'Bearer',
        expires_in: process.env.JWT_EXPIRES_IN || '7d'
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      error: 'Internal server error during registration',
      code: 'REGISTRATION_ERROR'
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', authRateLimit, validate(userSchemas.login), async (req, res) => {
  try {
    const { email, password } = req.validatedData;

    // Find user by email - using the more comprehensive query that includes all fields
    const user = await dbQueries.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (user.rows.length === 0) {
      return res.status(401).json({ 
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    const userData = user.rows[0];

    // Check if account is active
    if (!userData.is_active) {
      return res.status(401).json({ 
        error: 'Account is deactivated',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

    // Verify password
    const passwordMatch = await comparePassword(password, userData.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ 
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Update last login
    try {
      await dbQueries.updateUserLastLogin(userData.id);
    } catch (loginUpdateError) {
      console.warn('Failed to update last login:', loginUpdateError.message);
      // Continue without failing the login
    }

    // Generate tokens
    const accessToken = generateToken(userData);
    const refreshToken = generateRefreshToken(userData);

    res.json({
      message: 'Login successful',
      user: {
        id: userData.id,
        uuid: userData.uuid,
        name: userData.name,
        email: userData.email,
        phone: userData.phone,
        user_type: userData.user_type,
        shop_name: userData.shop_name,
        avatar_url: userData.avatar_url,
        is_verified: userData.is_verified,
        last_login: userData.last_login
      },
      tokens: {
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'Bearer',
        expires_in: process.env.JWT_EXPIRES_IN || '7d'
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      error: 'Internal server error during login',
      code: 'LOGIN_ERROR'
    });
  }
});

// @route   POST /api/auth/refresh
// @desc    Refresh access token
// @access  Public
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(401).json({ 
        error: 'Refresh token required',
        code: 'REFRESH_TOKEN_REQUIRED'
      });
    }

    // Check if refresh token is blacklisted
    if (tokenBlacklist.isBlacklisted(refresh_token)) {
      return res.status(401).json({ 
        error: 'Refresh token has been revoked',
        code: 'REFRESH_TOKEN_REVOKED'
      });
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refresh_token);
    
    // Get user from database
    const user = await dbQueries.findUserById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ 
        error: 'Invalid refresh token',
        code: 'INVALID_REFRESH_TOKEN'
      });
    }

    if (!user.is_active) {
      return res.status(401).json({ 
        error: 'Account is deactivated',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

    // Generate new tokens
    const accessToken = generateToken(user);
    const newRefreshToken = generateRefreshToken(user);

    // Optionally blacklist the old refresh token
    await tokenBlacklist.addToken(refresh_token, user.id);

    res.json({
      message: 'Tokens refreshed successfully',
      tokens: {
        access_token: accessToken,
        refresh_token: newRefreshToken,
        token_type: 'Bearer',
        expires_in: process.env.JWT_EXPIRES_IN || '7d'
      }
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Refresh token expired',
        code: 'REFRESH_TOKEN_EXPIRED'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid refresh token',
        code: 'INVALID_REFRESH_TOKEN'
      });
    }
    
    res.status(500).json({ 
      error: 'Internal server error during token refresh',
      code: 'TOKEN_REFRESH_ERROR'
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user with token blacklisting
// @access  Semi-protected (allows expired/invalid tokens for cleanup)
router.post('/logout', optionalAuthForLogout, async (req, res) => {
  try {
    const { refresh_token } = req.body;
    const userId = req.user ? req.user.id : undefined;

    // Blacklist access token if provided
    if (req.token) {
      const success = await tokenBlacklist.addToken(req.token, userId);
      if (success) {
        console.log(`✅ Access token blacklisted for user ${userId || 'unknown'}`);
      }
    }

    // Blacklist refresh token if provided
    if (refresh_token) {
      const success = await tokenBlacklist.addToken(refresh_token, userId);
      if (success) {
        console.log(`✅ Refresh token blacklisted for user ${userId || 'unknown'}`);
      }
    }

    res.json({
      message: 'Logged out successfully',
      code: 'LOGOUT_SUCCESS'
    });
  } catch (error) {
    console.error('Logout error:', error);

    // Even if blacklisting fails, return success to avoid client confusion
    res.json({
      message: 'Logged out successfully',
      code: 'LOGOUT_SUCCESS',
      warning: 'Token cleanup may have failed'
    });
  }
});

// @route   POST /api/auth/logout-all
// @desc    Logout from all devices (blacklist all user tokens)
// @access  Private
router.post('/logout-all', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { refresh_token } = req.body;

    // Blacklist current access token
    if (req.token) {
      await tokenBlacklist.addToken(req.token, userId);
    }

    // Blacklist provided refresh token
    if (refresh_token) {
      await tokenBlacklist.addToken(refresh_token, userId);
    }

    // Attempt to blacklist all user tokens (limited effectiveness without token tracking)
    await tokenBlacklist.blacklistAllUserTokens(userId);

    res.json({
      message: 'Logged out from all devices successfully',
      code: 'LOGOUT_ALL_SUCCESS'
    });
  } catch (error) {
    console.error('Logout all error:', error);
    res.status(500).json({ 
      error: 'Internal server error during logout',
      code: 'LOGOUT_ALL_ERROR'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user info
// @access  Private
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await dbQueries.findUserById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ 
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json({
      user: {
        id: user.id,
        uuid: user.uuid,
        name: user.name,
        email: user.email,
        phone: user.phone,
        user_type: user.user_type,
        shop_name: user.shop_name,
        avatar_url: user.avatar_url,
        is_verified: user.is_verified,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('Get user info error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_USER_ERROR'
    });
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Request password reset
// @access  Public
router.post('/forgot-password', authRateLimit, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        error: 'Email is required',
        code: 'EMAIL_REQUIRED'
      });
    }

    const user = await dbQueries.findUserByEmail(email);
    
    // Don't reveal if user exists for security
    if (!user) {
      return res.json({
        message: 'If an account with that email exists, a password reset link has been sent'
      });
    }

    // TODO: Implement password reset email sending
    // For now, just return success message
    
    res.json({
      message: 'If an account with that email exists, a password reset link has been sent'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'FORGOT_PASSWORD_ERROR'
    });
  }
});

// @route   POST /api/auth/change-password
// @desc    Change user password
// @access  Private
router.post('/change-password', authenticateToken, validate(userSchemas.changePassword), async (req, res) => {
  try {
    const { current_password, new_password } = req.validatedData;
    const userId = req.user.id;

    // Get user with password hash
    const user = await dbQueries.getUserPasswordHash(userId);

    if (!user) {
      return res.status(404).json({ 
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Verify current password
    const passwordMatch = await comparePassword(current_password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ 
        error: 'Current password is incorrect',
        code: 'INVALID_CURRENT_PASSWORD'
      });
    }

    // Hash new password
    const newPasswordHash = await hashPassword(new_password);

    // Update password
    await dbQueries.updateUserPassword(userId, newPasswordHash);

    // Optionally blacklist current token to force re-login
    if (req.token) {
      await tokenBlacklist.addToken(req.token, userId);
    }

    res.json({
      message: 'Password changed successfully',
      code: 'PASSWORD_CHANGED',
      note: 'Please log in again with your new password'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'CHANGE_PASSWORD_ERROR'
    });
  }
});

// @route   POST /api/auth/verify-email
// @desc    Verify user email
// @access  Private
router.post('/verify-email', authenticateToken, async (req, res) => {
  try {
    const { verification_code } = req.body;
    const userId = req.user.id;

    // TODO: Implement email verification logic
    // For now, just mark as verified
    
    await dbQueries.verifyUserEmail(userId);

    res.json({
      message: 'Email verified successfully'
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'EMAIL_VERIFICATION_ERROR'
    });
  }
});

// @route   GET /api/auth/blacklist-stats
// @desc    Get token blacklist statistics (admin/debug)
// @access  Private
router.get('/blacklist-stats', authenticateToken, async (req, res) => {
  try {
    // Only allow admins or in development
    if (process.env.NODE_ENV === 'production' && req.user.user_type !== 'admin') {
      return res.status(403).json({ 
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    const stats = await tokenBlacklist.getStats();
    
    res.json({
      blacklist_stats: stats
    });
  } catch (error) {
    console.error('Get blacklist stats error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_BLACKLIST_STATS_ERROR'
    });
  }
});

module.exports = router;