# Amasampo Marketplace Server

A comprehensive Node.js backend server for the Amasampo marketplace application, built with Express.js, PostgreSQL, and Socket.IO.

## 🚀 Features

- **RESTful API** with comprehensive endpoints for all marketplace operations
- **Real-time messaging** using Socket.IO for chat and notifications
- **JWT Authentication** with refresh tokens
- **Role-based authorization** (buyers and sellers)
- **File upload handling** with image processing
- **Email notifications** for order updates
- **Payment processing** integration ready
- **Review and rating system**
- **Shopping cart functionality**
- **Order management** with status tracking
- **Address and payment method management**
- **Real-time notifications**
- **Database migrations** and seeding
- **Rate limiting** and security middleware
- **Input validation** with Joi
- **Error handling** and logging

## 📋 Prerequisites

Before running this application, make sure you have the following installed:

- [Node.js](https://nodejs.org/) (v16.0.0 or higher)
- [PostgreSQL](https://www.postgresql.org/) (v12 or higher)
- [npm](https://www.npmjs.com/) (v8.0.0 or higher)

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/amasampo/amasampo-server.git
   cd amasampo-server
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit the `.env` file with your actual configuration values.

4. **Set up the database**
   ```bash
   # Create database
   createdb amasampo_marketplace
   
   # Run migrations
   npm run migrate
   
   # Seed the database (optional)
   npm run seed
   ```

5. **Create upload directories**
   ```bash
   mkdir -p src/uploads/products
   mkdir -p src/uploads/avatars
   mkdir -p src/uploads/temp
   ```

## 🚀 Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

The server will start on the port specified in your `.env` file (default: 3000).

## 📁 Project Structure

```
amasampo-server/
├── src/
│   ├── config/
│   │   └── database.js          # Database configuration
│   ├── middleware/
│   │   ├── auth.js              # Authentication middleware
│   │   └── errorHandler.js      # Error handling middleware
│   ├── routes/
│   │   ├── auth.js              # Authentication routes
│   │   ├── users.js             # User management routes
│   │   ├── products.js          # Product management routes
│   │   ├── orders.js            # Order management routes
│   │   ├── cart.js              # Shopping cart routes
│   │   ├── messages.js          # Messaging routes
│   │   ├── reviews.js           # Review management routes
│   │   ├── notifications.js     # Notification routes
│   │   ├── upload.js            # File upload routes
│   │   ├── categories.js        # Category management routes
│   │   ├── addresses.js         # Address management routes
│   │   └── payment.js           # Payment processing routes
│   ├── socket/
│   │   └── handlers.js          # Socket.IO event handlers
│   ├── utils/
│   │   └── password.js          # Password hashing utilities
│   ├── validation/
│   │   └── schemas.js           # Joi validation schemas
│   ├── uploads/                 # File upload directory
│   └── server.js               # Main server file
├── scripts/
│   ├── migrate.js              # Database migration script
│   └── seed.js                 # Database seeding script
├── tests/                      # Test files
├── .env.example               # Environment variables template
├── .gitignore                 # Git ignore file
├── package.json              # Package configuration
└── README.md                 # This file
```

## 🔧 Available Scripts

- `npm start` - Start the server in production mode
- `npm run dev` - Start the server in development mode with auto-reload
- `npm run migrate` - Run database migrations
- `npm run seed` - Seed the database with sample data
- `npm test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Run ESLint and fix issues

## 📡 API Documentation

### Base URL
```
http://localhost:3000/api
```

### Authentication
Most endpoints require authentication. Include the JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

### Main Endpoints

#### Authentication
- `POST /auth/register` - Register a new user
- `POST /auth/login` - Login user
- `POST /auth/refresh` - Refresh access token
- `POST /auth/logout` - Logout user
- `GET /auth/me` - Get current user info

#### Users
- `GET /users/profile` - Get user profile
- `PUT /users/profile` - Update user profile
- `POST /users/upload-avatar` - Upload user avatar
- `GET /users/dashboard` - Get dashboard data

#### Products
- `GET /products` - Get all products (with filters)
- `GET /products/:id` - Get single product
- `POST /products` - Create new product (sellers only)
- `PUT /products/:id` - Update product (owner only)
- `DELETE /products/:id` - Delete product (owner only)
- `GET /products/featured` - Get featured products

#### Orders
- `POST /orders` - Create new order
- `GET /orders` - Get user's orders
- `GET /orders/:id` - Get order details
- `PUT /orders/:id/status` - Update order status (sellers only)
- `POST /orders/:id/cancel` - Cancel order

#### Cart
- `GET /cart` - Get cart items
- `POST /cart/add` - Add item to cart
- `PUT /cart/update/:productId` - Update cart item
- `DELETE /cart/remove/:productId` - Remove item from cart
- `DELETE /cart/clear` - Clear cart

#### Messages
- `GET /messages/conversations` - Get user conversations
- `GET /messages/conversation/:userId` - Get conversation with user
- `POST /messages/send` - Send message
- `GET /messages/unread-count` - Get unread message count

#### Reviews
- `GET /reviews/product/:productId` - Get product reviews
- `POST /reviews` - Create review
- `PUT /reviews/:id` - Update review
- `DELETE /reviews/:id` - Delete review

### Response Format

All API responses follow this format:
```json
{
  "success": true,
  "data": {
    // Response data
  },
  "message": "Success message"
}
```

Error responses:
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

## 🔐 Environment Variables

Key environment variables you need to set:

```bash
# Server
NODE_ENV=development
PORT=3000
CLIENT_URL=http://localhost:3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=amasampo_marketplace
DB_USER=postgres
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d

# Email (optional)
EMAIL_SERVICE=gmail
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password

# File Uploads
UPLOAD_MAX_SIZE=5242880
UPLOAD_MAX_FILES=5
```

## 🧪 Testing

Run the test suite:
```bash
npm test
```

Run tests with coverage:
```bash
npm run test:coverage
```

## 🔧 Database Schema

The application uses PostgreSQL with the following main tables:

- `users` - User accounts (buyers and sellers)
- `categories` - Product categories
- `products` - Product listings
- `orders` - Order information
- `order_items` - Items in each order
- `cart_items` - Shopping cart items
- `reviews` - Product reviews
- `messages` - User messages
- `notifications` - System notifications
- `addresses` - User addresses
- `payment_methods` - User payment methods

## 🔌 Socket.IO Events

The server supports real-time communication through Socket.IO:

### Client Events
- `join_chat` - Join a chat room
- `send_message` - Send a message
- `typing_start` - Start typing indicator
- `typing_stop` - Stop typing indicator
- `mark_messages_read` - Mark messages as read

### Server Events
- `new_message` - New message received
- `user_typing` - User is typing
- `user_stopped_typing` - User stopped typing
- `notification` - New notification
- `order_status_changed` - Order status updated

## 🚀 Deployment

### Using PM2 (Recommended)
```bash
# Install PM2 globally
npm install -g pm2

# Start the application
pm2 start src/server.js --name amasampo-server

# Save PM2 configuration
pm2 save
pm2 startup
```

### Using Docker
```bash
# Build Docker image
docker build -t amasampo-server .

# Run container
docker run -p 3000:3000 --env-file .env amasampo-server
```

## 📊 Monitoring and Logging

The application includes:
- Request logging with Morgan
- Error tracking and reporting
- Performance monitoring endpoints
- Health check endpoint at `/health`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support, email support@amasampo.com or join our Slack channel.

## 🙏 Acknowledgments

- Express.js team for the excellent web framework
- PostgreSQL team for the robust database
- Socket.IO team for real-time capabilities
- All contributors and testers

---

**Happy coding! 🚀**