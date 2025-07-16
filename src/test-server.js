/* eslint-disable linebreak-style */
/* eslint-disable import/no-dynamic-require */
/* eslint-disable linebreak-style */
/* eslint-disable global-require */
/* eslint-disable linebreak-style */
/* eslint-disable object-shorthand */
/* eslint-disable linebreak-style */
/* eslint-disable no-use-before-define */
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
// test-server.js - Minimal server to test routes
// test-server.js - Minimal server to test routes
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// Basic middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Test all routes one by one
const routesToTest = [
  { name: 'auth', path: './routes/auth', mount: '/api/auth' },
  { name: 'categories', path: './routes/categories', mount: '/api/categories' },
  { name: 'addresses', path: './routes/addresses', mount: '/api/addresses' },
  { name: 'payment', path: './routes/payment', mount: '/api/payment' },
  { name: 'product', path: './routes/product', mount: '/api/products' },
  { name: 'users', path: './routes/users', mount: '/api/users' },
  { name: 'orders', path: './routes/orders', mount: '/api/orders' },
  { name: 'cart', path: './routes/cart', mount: '/api/cart' },
  { name: 'messages', path: './routes/messages', mount: '/api/messages' },
  { name: 'reviews', path: './routes/reviews', mount: '/api/reviews' },
  { name: 'notifications', path: './routes/notifications', mount: '/api/notifications' },
  { name: 'upload', path: './routes/upload', mount: '/api/upload' }
];

for (const route of routesToTest) {
  console.log(`Testing ${route.name} routes...`);
  try {
    const routeModule = require(route.path);
    app.use(route.mount, routeModule);
    console.log(`✅ ${route.name} routes loaded successfully`);
  } catch (error) {
    console.error(`❌ Error loading ${route.name} routes:`, error.message);
    console.error(`   File: ${route.path}`);
    console.error(`   Stack: ${error.stack}`);
    process.exit(1); // Exit on first error to identify the problematic route
  }
}

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Test server running on port ${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log('🎉 All routes loaded successfully!');
});

module.exports = app;