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
// routes/upload.js - File upload routes
const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const { dbQueries } = require('../config/database');

// Create uploads directory if it doesn't exist
const createUploadsDir = async () => {
  const uploadsDir = path.join(__dirname, '../uploads');
  const subdirs = ['products', 'avatars', 'temp'];
  
  try {
    await fs.mkdir(uploadsDir, { recursive: true });
    for (const subdir of subdirs) {
      await fs.mkdir(path.join(uploadsDir, subdir), { recursive: true });
    }
  } catch (error) {
    console.error('Error creating uploads directory:', error);
  }
};

// Initialize uploads directory
createUploadsDir();

// Multer configuration
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Check file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 5 // Maximum 5 files
  }
});

// Helper function to process image
const processImage = async (buffer, type = 'product') => {
  const quality = type === 'avatar' ? 90 : 85;
  const maxWidth = type === 'avatar' ? 400 : 800;
  const maxHeight = type === 'avatar' ? 400 : 800;

  return await sharp(buffer)
    .resize(maxWidth, maxHeight, { 
      fit: 'inside',
      withoutEnlargement: true 
    })
    .jpeg({ quality })
    .toBuffer();
};

// Helper function to save file
const saveFile = async (buffer, filename, subfolder) => {
  const filePath = path.join(__dirname, '../uploads', subfolder, filename);
  await fs.writeFile(filePath, buffer);
  return `/uploads/${subfolder}/${filename}`;
};

// @route   POST /api/upload/product-image
// @desc    Upload product image
// @access  Private (Sellers only)
router.post('/product-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No image file provided',
        code: 'NO_FILE_PROVIDED'
      });
    }

    if (req.user.user_type !== 'seller') {
      return res.status(403).json({ 
        error: 'Only sellers can upload product images',
        code: 'UNAUTHORIZED_USER_TYPE'
      });
    }

    // Process image
    const processedBuffer = await processImage(req.file.buffer, 'product');
    
    // Generate unique filename
    const filename = `${uuidv4()}-${Date.now()}.jpg`;
    
    // Save file
    const imageUrl = await saveFile(processedBuffer, filename, 'products');

    res.json({
      message: 'Product image uploaded successfully',
      image_url: imageUrl,
      filename
    });
  } catch (error) {
    console.error('Upload product image error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'UPLOAD_PRODUCT_IMAGE_ERROR'
    });
  }
});

// @route   POST /api/upload/product-images
// @desc    Upload multiple product images
// @access  Private (Sellers only)
router.post('/product-images', upload.array('images', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ 
        error: 'No image files provided',
        code: 'NO_FILES_PROVIDED'
      });
    }

    if (req.user.user_type !== 'seller') {
      return res.status(403).json({ 
        error: 'Only sellers can upload product images',
        code: 'UNAUTHORIZED_USER_TYPE'
      });
    }

    const uploadedImages = [];

    for (const file of req.files) {
      // Process image
      const processedBuffer = await processImage(file.buffer, 'product');
      
      // Generate unique filename
      const filename = `${uuidv4()}-${Date.now()}.jpg`;
      
      // Save file
      const imageUrl = await saveFile(processedBuffer, filename, 'products');
      
      uploadedImages.push({
        image_url: imageUrl,
        filename,
        original_name: file.originalname
      });
    }

    res.json({
      message: 'Product images uploaded successfully',
      images: uploadedImages
    });
  } catch (error) {
    console.error('Upload product images error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'UPLOAD_PRODUCT_IMAGES_ERROR'
    });
  }
});

// @route   POST /api/upload/avatar
// @desc    Upload user avatar
// @access  Private
router.post('/avatar', upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No avatar file provided',
        code: 'NO_FILE_PROVIDED'
      });
    }

    // Process image
    const processedBuffer = await processImage(req.file.buffer, 'avatar');
    
    // Generate unique filename
    const filename = `${req.user.id}-${uuidv4()}-${Date.now()}.jpg`;
    
    // Save file
    const avatarUrl = await saveFile(processedBuffer, filename, 'avatars');

    // Update user avatar in database
    await dbQueries.updateUser(req.user.id, { avatar_url: avatarUrl });

    res.json({
      message: 'Avatar uploaded successfully',
      avatar_url: avatarUrl,
      filename
    });
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'UPLOAD_AVATAR_ERROR'
    });
  }
});

// @route   DELETE /api/upload/image
// @desc    Delete uploaded image
// @access  Private
router.delete('/image', async (req, res) => {
  try {
    const { image_url } = req.body;

    if (!image_url) {
      return res.status(400).json({ 
        error: 'Image URL is required',
        code: 'IMAGE_URL_REQUIRED'
      });
    }

    // Validate that the image URL is from our server
    if (!image_url.startsWith('/uploads/')) {
      return res.status(400).json({ 
        error: 'Invalid image URL',
        code: 'INVALID_IMAGE_URL'
      });
    }

    // Check if user has permission to delete this image
    // For now, we'll allow users to delete their own uploaded images
    const filePath = path.join(__dirname, '..', image_url);
    
    try {
      await fs.access(filePath);
      await fs.unlink(filePath);
      
      res.json({
        message: 'Image deleted successfully'
      });
    } catch (error) {
      if (error.code === 'ENOENT') {
        return res.status(404).json({ 
          error: 'Image not found',
          code: 'IMAGE_NOT_FOUND'
        });
      }
      throw error;
    }
  } catch (error) {
    console.error('Delete image error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'DELETE_IMAGE_ERROR'
    });
  }
});

// @route   GET /api/upload/images
// @desc    Get user's uploaded images
// @access  Private
router.get('/images', async (req, res) => {
  try {
    const userId = req.user.id;
    const type = req.query.type || 'all'; // 'products', 'avatars', 'all'
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    // This is a simplified version - in production you'd want to store image metadata in database
    const uploadsDir = path.join(__dirname, '../uploads');
    const images = [];

    if (type === 'all' || type === 'products') {
      const productImagesDir = path.join(uploadsDir, 'products');
      try {
        const files = await fs.readdir(productImagesDir);
        for (const file of files) {
          const stats = await fs.stat(path.join(productImagesDir, file));
          images.push({
            type: 'product',
            url: `/uploads/products/${file}`,
            filename: file,
            size: stats.size,
            created_at: stats.birthtime
          });
        }
      } catch (error) {
        // Directory doesn't exist or is empty
      }
    }

    if (type === 'all' || type === 'avatars') {
      const avatarsDir = path.join(uploadsDir, 'avatars');
      try {
        const files = await fs.readdir(avatarsDir);
        for (const file of files) {
          if (file.startsWith(`${userId}-`)) {
            const stats = await fs.stat(path.join(avatarsDir, file));
            images.push({
              type: 'avatar',
              url: `/uploads/avatars/${file}`,
              filename: file,
              size: stats.size,
              created_at: stats.birthtime
            });
          }
        }
      } catch (error) {
        // Directory doesn't exist or is empty
      }
    }

    // Sort by creation date, newest first
    images.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedImages = images.slice(startIndex, endIndex);

    res.json({
      images: paginatedImages,
      pagination: {
        page,
        limit,
        total: images.length,
        pages: Math.ceil(images.length / limit),
        has_next: endIndex < images.length,
        has_prev: page > 1
      }
    });
  } catch (error) {
    console.error('Get images error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'GET_IMAGES_ERROR'
    });
  }
});

// @route   POST /api/upload/cleanup
// @desc    Clean up unused images
// @access  Private (Admin only - for now any authenticated user)
router.post('/cleanup', async (req, res) => {
  try {
    const uploadsDir = path.join(__dirname, '../uploads');
    const tempDir = path.join(uploadsDir, 'temp');
    
    // Clean up temp directory (files older than 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    let cleanedFiles = 0;

    try {
      const files = await fs.readdir(tempDir);
      for (const file of files) {
        const filePath = path.join(tempDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.birthtime < oneHourAgo) {
          await fs.unlink(filePath);
          cleanedFiles++;
        }
      }
    } catch (error) {
      // Directory doesn't exist or is empty
    }

    res.json({
      message: 'Cleanup completed successfully',
      cleaned_files: cleanedFiles
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'CLEANUP_ERROR'
    });
  }
});

// Error handling middleware for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large. Maximum size is 5MB.',
        code: 'FILE_TOO_LARGE'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        error: 'Too many files. Maximum is 5 files.',
        code: 'TOO_MANY_FILES'
      });
    }
  }
  
  if (error.message.includes('Invalid file type')) {
    return res.status(400).json({
      error: error.message,
      code: 'INVALID_FILE_TYPE'
    });
  }
  
  next(error);
});

module.exports = router;