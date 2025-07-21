/* eslint-disable linebreak-style */
/* eslint-disable import/extensions */
/* eslint-disable linebreak-style */
/* eslint-disable import/no-unresolved */
/* eslint-disable linebreak-style */
/* eslint-disable max-len */
/* eslint-disable linebreak-style */
/* eslint-disable no-continue */
/* eslint-disable linebreak-style */
/* eslint-disable no-whitespace-before-property */
/* eslint-disable linebreak-style */
/* eslint-disable global-require */
/* eslint-disable padded-blocks */
/* eslint-disable linebreak-style */
/* eslint-disable no-multiple-empty-lines */

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

/* eslint-disable linebreak-style */
// scripts/clear-rate-limit.js - Temporarily disable rate limiting for testing
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// Basic middleware - NO RATE LIMITING
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    note: 'Rate limiting disabled for testing'
  });
});

// Import and setup auth routes without rate limiting
try {
  const authRoutes = require('../src/routes/auth');
  app.use('/api/auth', authRoutes); // NO RATE LIMITING
  console.log('✅ Auth routes loaded without rate limiting');
} catch (error) {
  console.error('❌ Error loading auth routes:', error.message);
  process.exit(1);
}

// Start temporary server
const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log('🚀 Temporary server running WITHOUT rate limiting');
  console.log(`📱 Auth API: http://localhost:${PORT}/api/auth`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log('');
  console.log('⚠️  This is for testing only!');
  console.log('   Use this to test login/register without rate limits');
  console.log('   Press Ctrl+C to stop when done testing');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Stopping temporary server...');
  server.close(() => {
    console.log('✅ Temporary server stopped');
    process.exit(0);
  });
});

module.exports = app;