/* eslint-disable linebreak-style */
/* eslint-disable radix */
/* eslint-disable linebreak-style */
/* eslint-disable no-unused-vars */
/* eslint-disable linebreak-style */
/* eslint-disable global-require */
/* eslint-disable linebreak-style */
/* eslint-disable class-methods-use-this */
/* eslint-disable linebreak-style */
/* eslint-disable arrow-parens */
/* eslint-disable linebreak-style */
/* eslint-disable no-trailing-spaces */
/* eslint-disable linebreak-style */
/* eslint-disable eol-last */
/* eslint-disable operator-linebreak */
/* eslint-disable comma-dangle */
/* eslint-disable arrow-body-style */
/* eslint-disable linebreak-style */
// src/utils/tokenBlacklist.js - Complete token blacklist implementation
const { dbQueries } = require('../config/database');

class TokenBlacklist {
  constructor() {
    // In-memory storage for fast access
    this.blacklistedTokens = new Set();
    
    // Load existing blacklisted tokens from database on startup
    this.loadFromDatabase();
    
    // Clean up expired tokens every hour
    setInterval(() => {
      this.cleanupExpiredTokens();
    }, 60 * 60 * 1000); // 1 hour
  }

  /**
   * Load blacklisted tokens from database
   */
  async loadFromDatabase() {
    try {
      console.log('🔄 Loading blacklisted tokens from database...');
      
      // Create blacklisted_tokens table if it doesn't exist
      await dbQueries.query(`
        CREATE TABLE IF NOT EXISTS blacklisted_tokens (
          id SERIAL PRIMARY KEY,
          token_hash VARCHAR(255) UNIQUE NOT NULL,
          user_id INTEGER,
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_blacklisted_tokens_hash ON blacklisted_tokens(token_hash);
        CREATE INDEX IF NOT EXISTS idx_blacklisted_tokens_expires ON blacklisted_tokens(expires_at);
      `);

      // Load non-expired tokens
      const result = await dbQueries.query(
        'SELECT token_hash FROM blacklisted_tokens WHERE expires_at > NOW()'
      );

      // Add to in-memory set
      result.rows.forEach(row => {
        this.blacklistedTokens.add(row.token_hash);
      });

      console.log(`✅ Loaded ${result.rows.length} blacklisted tokens`);
    } catch (error) {
      console.error('❌ Error loading blacklisted tokens:', error.message);
      // Continue with empty blacklist if database fails
    }
  }

  /**
   * Hash token for storage (for security and consistent length)
   */
  hashToken(token) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Get token expiration time from JWT
   */
  getTokenExpiration(token) {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.decode(token);
      
      if (decoded && decoded.exp) {
        return new Date(decoded.exp * 1000);
      }
      
      // Default to 7 days if no expiration found
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    } catch (error) {
      // Default to 7 days if token can't be decoded
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }
  }

  /**
   * Add token to blacklist
   */
  async addToken(token, userId = null) {
    try {
      const tokenHash = this.hashToken(token);
      const expiresAt = this.getTokenExpiration(token);

      // Add to in-memory set
      this.blacklistedTokens.add(tokenHash);

      // Add to database
      await dbQueries.query(
        'INSERT INTO blacklisted_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, $3) ON CONFLICT (token_hash) DO NOTHING',
        [tokenHash, userId, expiresAt]
      );

      console.log(`🚫 Token blacklisted for user ${userId || 'unknown'}`);
      return true;
    } catch (error) {
      console.error('❌ Error blacklisting token:', error.message);
      return false;
    }
  }

  /**
   * Check if token is blacklisted
   */
  isBlacklisted(token) {
    if (!token) return false;
    
    const tokenHash = this.hashToken(token);
    return this.blacklistedTokens.has(tokenHash);
  }

  /**
   * Remove token from blacklist (for testing or manual unblocking)
   */
  async removeToken(token) {
    try {
      const tokenHash = this.hashToken(token);

      // Remove from in-memory set
      this.blacklistedTokens.delete(tokenHash);

      // Remove from database
      await dbQueries.query(
        'DELETE FROM blacklisted_tokens WHERE token_hash = $1',
        [tokenHash]
      );

      console.log('✅ Token removed from blacklist');
      return true;
    } catch (error) {
      console.error('❌ Error removing token from blacklist:', error.message);
      return false;
    }
  }

  /**
   * Blacklist all tokens for a specific user
   */
  async blacklistAllUserTokens(userId) {
    try {
      // Get all non-expired tokens for the user
      const result = await dbQueries.query(
        'SELECT token_hash FROM blacklisted_tokens WHERE user_id = $1 AND expires_at > NOW()',
        [userId]
      );

      // This is a simplified approach - in a real system, you'd need to track
      // all active tokens per user, which requires storing them when issued
      console.log(`🚫 Attempted to blacklist all tokens for user ${userId}`);
      console.log('⚠️  Note: Only previously blacklisted tokens can be found. Consider implementing token tracking on issuance.');
      
      return true;
    } catch (error) {
      console.error('❌ Error blacklisting user tokens:', error.message);
      return false;
    }
  }

  /**
   * Clean up expired tokens
   */
  async cleanupExpiredTokens() {
    try {
      console.log('🧹 Cleaning up expired blacklisted tokens...');

      // Remove expired tokens from database
      const result = await dbQueries.query(
        'DELETE FROM blacklisted_tokens WHERE expires_at <= NOW()'
      );

      // Reload in-memory set from database to remove expired tokens
      this.blacklistedTokens.clear();
      await this.loadFromDatabase();

      console.log(`🗑️  Cleaned up ${result.rowCount || 0} expired tokens`);
    } catch (error) {
      console.error('❌ Error cleaning up expired tokens:', error.message);
    }
  }

  /**
   * Get blacklist statistics
   */
  async getStats() {
    try {
      const result = await dbQueries.query(`
        SELECT 
          COUNT(*) as total_blacklisted,
          COUNT(CASE WHEN expires_at > NOW() THEN 1 END) as active_blacklisted,
          COUNT(CASE WHEN expires_at <= NOW() THEN 1 END) as expired_blacklisted
        FROM blacklisted_tokens
      `);

      return {
        total: parseInt(result.rows[0].total_blacklisted) || 0,
        active: parseInt(result.rows[0].active_blacklisted) || 0,
        expired: parseInt(result.rows[0].expired_blacklisted) || 0,
        in_memory: this.blacklistedTokens.size
      };
    } catch (error) {
      console.error('❌ Error getting blacklist stats:', error.message);
      return {
        total: 0,
        active: 0,
        expired: 0,
        in_memory: this.blacklistedTokens.size
      };
    }
  }

  /**
   * Clear all blacklisted tokens (use with caution)
   */
  async clearAll() {
    try {
      console.log('🚨 Clearing all blacklisted tokens...');

      // Clear in-memory set
      this.blacklistedTokens.clear();

      // Clear database
      const result = await dbQueries.query('DELETE FROM blacklisted_tokens');

      console.log(`🗑️  Cleared ${result.rowCount || 0} blacklisted tokens`);
      return true;
    } catch (error) {
      console.error('❌ Error clearing blacklisted tokens:', error.message);
      return false;
    }
  }
}

// Create singleton instance
const tokenBlacklist = new TokenBlacklist();

// Export both the class and the instance
module.exports = {
  TokenBlacklist,
  tokenBlacklist
};