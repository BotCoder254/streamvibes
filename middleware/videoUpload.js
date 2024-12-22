const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

// Configure multer for video upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/videos');
    },
    filename: function (req, file, cb) {
        // Generate unique filename
        const uniqueSuffix = crypto.randomBytes(16).toString('hex');
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

// File filter for video formats
const fileFilter = (req, file, cb) => {
    // Allowed video formats
    const allowedFormats = ['.mp4', '.mkv', '.avi', '.mov', '.wmv'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedFormats.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file format. Only video files are allowed.'), false);
    }
};

// Configure upload limits
const limits = {
    fileSize: 1024 * 1024 * 500, // 500MB max file size
    files: 1 // Maximum 1 file per upload
};

// Create multer upload instance
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: limits
});

module.exports = upload; 