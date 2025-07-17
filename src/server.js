/* eslint-disable linebreak-style */
/* eslint-disable global-require */
/* eslint-disable linebreak-style */
/* eslint-disable import/newline-after-import */
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
// server.js - Modified main server file with debugging
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
// server.js - Modified main server file with debugging
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

console.log('🚀 Starting server...');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });
console.log('✓ Environment variables loaded');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('CLIENT_URL:', process.env.CLIENT_URL);

// Import middleware first
console.log('Importing middleware...');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
console.log('✓ Error handler middleware imported');

const { authenticateToken } = require('./middleware/auth');
console.log('✓ Auth middleware imported');

// Create Express app
console.log('Creating Express app...');
const app = express();
const server = createServer(app);
console.log('✓ Express app and HTTP server created');

// Setup Socket.IO
console.log('Setting up Socket.IO...');
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});
console.log('✓ Socket.IO configured');

// Security middleware
console.log('Setting up security middleware...');
app.use(helmet());
console.log('✓ Helmet security middleware added');

app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true
}));
console.log('✓ CORS middleware added');

// Rate limiting
console.log('Setting up rate limiting...');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);
console.log('✓ Rate limiting configured');

// Basic middleware
console.log('Setting up basic middleware...');
app.use(compression());
console.log('✓ Compression middleware added');

app.use(morgan('combined'));
console.log('✓ Morgan logging middleware added');

app.use(express.json({ limit: '10mb' }));
console.log('✓ JSON parser middleware added');

app.use(express.urlencoded({ extended: true, limit: '10mb' }));
console.log('✓ URL-encoded parser middleware added');

// Static files
console.log('Setting up static files...');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
console.log('✓ Static files middleware added');

// Health check endpoint
console.log('Adding health check endpoint...');
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});
console.log('✓ Health check endpoint added');

// Import routes with detailed logging
console.log('📁 Starting route imports...');

try {
  console.log('Importing auth routes...');
  const authRoutes = require('./routes/auth');
  console.log('✓ Auth routes imported successfully');
} catch (error) {
  console.error('❌ Error importing auth routes:', error.message);
  process.exit(1);
}

try {
  console.log('Importing user routes...');
  const userRoutes = require('./routes/users');
  console.log('✓ User routes imported successfully');
} catch (error) {
  console.error('❌ Error importing user routes:', error.message);
  process.exit(1);
}

try {
  console.log('Importing product routes...');
  const productRoutes = require('./routes/product');
  console.log('✓ Product routes imported successfully');
} catch (error) {
  console.error('❌ Error importing product routes:', error.message);
  process.exit(1);
}

try {
  console.log('Importing order routes...');
  const orderRoutes = require('./routes/orders');
  console.log('✓ Order routes imported successfully');
} catch (error) {
  console.error('❌ Error importing order routes:', error.message);
  process.exit(1);
}

try {
  console.log('Importing cart routes...');
  const cartRoutes = require('./routes/cart');
  console.log('✓ Cart routes imported successfully');
} catch (error) {
  console.error('❌ Error importing cart routes:', error.message);
  process.exit(1);
}

try {
  console.log('Importing message routes...');
  const messageRoutes = require('./routes/messages');
  console.log('✓ Message routes imported successfully');
} catch (error) {
  console.error('❌ Error importing message routes:', error.message);
  process.exit(1);
}

try {
  console.log('Importing review routes...');
  const reviewRoutes = require('./routes/reviews');
  console.log('✓ Review routes imported successfully');
} catch (error) {
  console.error('❌ Error importing review routes:', error.message);
  process.exit(1);
}

try {
  console.log('Importing notification routes...');
  const notificationRoutes = require('./routes/notifications');
  console.log('✓ Notification routes imported successfully');
} catch (error) {
  console.error('❌ Error importing notification routes:', error.message);
  process.exit(1);
}

try {
  console.log('Importing upload routes...');
  const uploadRoutes = require('./routes/upload');
  console.log('✓ Upload routes imported successfully');
} catch (error) {
  console.error('❌ Error importing upload routes:', error.message);
  process.exit(1);
}

try {
  console.log('Importing category routes...');
  const categoryRoutes = require('./routes/categories');
  console.log('✓ Category routes imported successfully');
} catch (error) {
  console.error('❌ Error importing category routes:', error.message);
  process.exit(1);
}

try {
  console.log('Importing address routes...');
  const addressRoutes = require('./routes/addresses');
  console.log('✓ Address routes imported successfully');
} catch (error) {
  console.error('❌ Error importing address routes:', error.message);
  process.exit(1);
}

try {
  console.log('Importing payment routes...');
  const paymentRoutes = require('./routes/payment');
  console.log('✓ Payment routes imported successfully');
} catch (error) {
  console.error('❌ Error importing payment routes:', error.message);
  process.exit(1);
}

console.log('✅ All route imports completed successfully!');
console.log('🔗 Starting route registration...');

// Re-assign the imported routes for use in registration
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const productRoutes = require('./routes/product');
const orderRoutes = require('./routes/orders');
const cartRoutes = require('./routes/cart');
const messageRoutes = require('./routes/messages');
const reviewRoutes = require('./routes/reviews');
const notificationRoutes = require('./routes/notifications');
const uploadRoutes = require('./routes/upload');
const categoryRoutes = require('./routes/categories');
const addressRoutes = require('./routes/addresses');
const paymentRoutes = require('./routes/payment');

// Public API Routes (no authentication required)
try {
  console.log('Registering auth routes at /api/auth...');
  app.use('/api/auth', authRoutes);
  console.log('✓ Auth routes registered successfully');
} catch (error) {
  console.error('❌ Error registering auth routes:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}

try {
  console.log('Registering category routes at /api/categories...');
  app.use('/api/categories', categoryRoutes);
  console.log('✓ Category routes registered successfully');
} catch (error) {
  console.error('❌ Error registering category routes:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}

try {
  console.log('Registering product routes at /api/products...');
  app.use('/api/products', productRoutes);
  console.log('✓ Product routes registered successfully');
} catch (error) {
  console.error('❌ Error registering product routes:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}

try {
  console.log('Registering review routes at /api/reviews...');
  app.use('/api/reviews', reviewRoutes);
  console.log('✓ Review routes registered successfully');
} catch (error) {
  console.error('❌ Error registering review routes:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}

console.log('✅ Public routes registered successfully!');
console.log('🔐 Starting protected route registration...');

// Protected API Routes (authentication required)
try {
  console.log('Registering user routes at /api/users with auth...');
  app.use('/api/users', authenticateToken, userRoutes);
  console.log('✓ User routes registered successfully');
} catch (error) {
  console.error('❌ Error registering user routes:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}

try {
  console.log('Registering order routes at /api/orders with auth...');
  app.use('/api/orders', authenticateToken, orderRoutes);
  console.log('✓ Order routes registered successfully');
} catch (error) {
  console.error('❌ Error registering order routes:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}

try {
  console.log('Registering cart routes at /api/cart with auth...');
  app.use('/api/cart', authenticateToken, cartRoutes);
  console.log('✓ Cart routes registered successfully');
} catch (error) {
  console.error('❌ Error registering cart routes:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}

try {
  console.log('Registering message routes at /api/messages with auth...');
  app.use('/api/messages', authenticateToken, messageRoutes);
  console.log('✓ Message routes registered successfully');
} catch (error) {
  console.error('❌ Error registering message routes:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}

try {
  console.log('Registering notification routes at /api/notifications with auth...');
  app.use('/api/notifications', authenticateToken, notificationRoutes);
  console.log('✓ Notification routes registered successfully');
} catch (error) {
  console.error('❌ Error registering notification routes:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}

try {
  console.log('Registering upload routes at /api/upload with auth...');
  app.use('/api/upload', authenticateToken, uploadRoutes);
  console.log('✓ Upload routes registered successfully');
} catch (error) {
  console.error('❌ Error registering upload routes:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}

try {
  console.log('Registering address routes at /api/addresses with auth...');
  app.use('/api/addresses', authenticateToken, addressRoutes);
  console.log('✓ Address routes registered successfully');
} catch (error) {
  console.error('❌ Error registering address routes:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}

try {
  console.log('Registering payment routes at /api/payment with auth...');
  app.use('/api/payment', authenticateToken, paymentRoutes);
  console.log('✓ Payment routes registered successfully');
} catch (error) {
  console.error('❌ Error registering payment routes:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}

console.log('✅ All protected routes registered successfully!');

// 404 handler
console.log('Adding 404 handler...');
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});
console.log('✓ 404 handler added');

// Error handling middleware
console.log('Adding error handling middleware...');
app.use(errorHandler);
console.log('✓ Error handling middleware added');

// Setup socket handlers (commented out for now to test)
// const { setupSocketHandlers } = require('./socket/handlers');
// setupSocketHandlers(io);

console.log('✅ All middleware and routes configured successfully!');

// Start server
const PORT = process.env.PORT || 3000;
console.log(`🚀 Starting server on port ${PORT}...`);

server.listen(PORT, () => {
  console.log(`✅ Server running successfully on port ${PORT}`);
  console.log(`📱 API available at http://localhost:${PORT}/api`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 Client URL: ${process.env.CLIENT_URL || 'http://localhost:3000'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = { app, server, io };