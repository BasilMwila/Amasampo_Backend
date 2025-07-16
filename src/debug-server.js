/* eslint-disable linebreak-style */
/* eslint-disable global-require */
/* eslint-disable linebreak-style */
/* eslint-disable no-unused-vars */
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
// middleware/auth.js - Authentication middleware
// utils/password.js - Password hashing utilities
// server.js - Main server file
// debug-server.js - Step by step server debugging
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
const dotenv = require('dotenv');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

// Load environment variables
dotenv.config();

console.log('Step 1: Creating Express app...');
const app = express();
const server = createServer(app);

console.log('Step 2: Setting up basic middleware...');
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

console.log('Step 3: Adding health check...');
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

console.log('Step 4: Testing Socket.IO setup...');
try {
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:3000",
      methods: ["GET", "POST"]
    }
  });
  console.log('✅ Socket.IO setup successful');
} catch (error) {
  console.error('❌ Socket.IO setup failed:', error.message);
  process.exit(1);
}

console.log('Step 5: Testing middleware imports...');
try {
  const { errorHandler } = require('./middleware/errorHandler');
  const { authenticateToken } = require('./middleware/auth');
  console.log('✅ Middleware imports successful');
} catch (error) {
  console.error('❌ Middleware import failed:', error.message);
  process.exit(1);
}

console.log('Step 6: Adding helmet and compression...');
try {
  app.use(helmet());
  app.use(compression());
  app.use(morgan('combined'));
  console.log('✅ Security middleware added successfully');
} catch (error) {
  console.error('❌ Security middleware failed:', error.message);
  process.exit(1);
}

console.log('Step 7: Adding rate limiting...');
try {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later.'
  });
  app.use('/api/', limiter);
  console.log('✅ Rate limiting added successfully');
} catch (error) {
  console.error('❌ Rate limiting failed:', error.message);
  process.exit(1);
}

console.log('Step 8: Adding static files...');
try {
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
  console.log('✅ Static files middleware added successfully');
} catch (error) {
  console.error('❌ Static files middleware failed:', error.message);
  process.exit(1);
}

console.log('Step 9: Loading routes without authentication...');
try {
  const authRoutes = require('./routes/auth');
  const categoryRoutes = require('./routes/categories');
  const productRoutes = require('./routes/product');
  const reviewRoutes = require('./routes/reviews');

  app.use('/api/auth', authRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/reviews', reviewRoutes);

  console.log('✅ Public routes loaded successfully');
} catch (error) {
  console.error('❌ Public routes loading failed:', error.message);
  console.error('Full error:', error);
  process.exit(1);
}

console.log('Step 10: Loading routes with authentication...');
try {
  const { authenticateToken } = require('./middleware/auth');

  const userRoutes = require('./routes/users');
  const orderRoutes = require('./routes/orders');
  const cartRoutes = require('./routes/cart');
  const messageRoutes = require('./routes/messages');
  const notificationRoutes = require('./routes/notifications');
  const uploadRoutes = require('./routes/upload');
  const addressRoutes = require('./routes/addresses');
  const paymentRoutes = require('./routes/payment');

  app.use('/api/users', authenticateToken, userRoutes);
  app.use('/api/orders', authenticateToken, orderRoutes);
  app.use('/api/cart', authenticateToken, cartRoutes);
  app.use('/api/messages', authenticateToken, messageRoutes);
  app.use('/api/notifications', authenticateToken, notificationRoutes);
  app.use('/api/upload', authenticateToken, uploadRoutes);
  app.use('/api/addresses', authenticateToken, addressRoutes);
  app.use('/api/payment', authenticateToken, paymentRoutes);

  console.log('✅ Protected routes loaded successfully');
} catch (error) {
  console.error('❌ Protected routes loading failed:', error.message);
  console.error('Full error:', error);
  process.exit(1);
}

console.log('Step 11: Adding error handlers...');
try {
  app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });

  const { errorHandler } = require('./middleware/errorHandler');
  app.use(errorHandler);

  console.log('✅ Error handlers added successfully');
} catch (error) {
  console.error('❌ Error handlers failed:', error.message);
  process.exit(1);
}

console.log('Step 12: Testing socket handlers...');
try {
  const { setupSocketHandlers } = require('./socket/handlers');
  // We'll skip this for now since it might be the issue
  console.log('✅ Socket handlers imported (not set up yet)');
} catch (error) {
  console.error('❌ Socket handlers import failed:', error.message);
  console.error('This might be the issue!');
}

console.log('Step 13: Starting server...');
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Debug server running on port ${PORT}`);
  console.log(`📱 API available at http://localhost:${PORT}/api`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log('🎉 Server started successfully!');
});

module.exports = { app, server };