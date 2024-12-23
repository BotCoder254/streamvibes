const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const Video = require('../models/Video');
const { ensureAuthenticated } = require('../middleware/auth');
const moment = require('moment');
const multer = require('multer');
const mongoose = require('mongoose');

// Create logs directory if it doesn't exist
fs.mkdir(path.join(__dirname, '..', 'logs'), { recursive: true }).catch(console.error);

// Helper function to log errors
async function logError(error, context) {
    const logFile = path.join(__dirname, '..', 'logs', 'app.log');
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} [${context}]: ${error.stack || error}\n`;
    
    try {
        await fs.appendFile(logFile, logEntry);
    } catch (err) {
        console.error('Error writing to log file:', err);
    }
    console.error(logEntry);
}

// Helper function to format duration
function formatDuration(seconds) {
    if (!seconds) return '0:00';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Configure multer storage
const storage = multer.diskStorage({
    destination: async function (req, file, cb) {
        try {
            const tempDir = path.join(__dirname, '..', 'uploads', 'temp');
            await fs.mkdir(tempDir, { recursive: true });
            cb(null, tempDir);
        } catch (err) {
            await logError(err, 'Multer Storage');
            cb(err);
        }
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

// Configure multer upload
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 500 * 1024 * 1024, // 500MB max file size
    },
    fileFilter: function (req, file, cb) {
        if (file.fieldname === 'video') {
            const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
            if (allowedTypes.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new Error('Invalid file type. Please upload MP4, MOV, AVI, or MKV.'));
            }
        } else if (file.fieldname === 'thumbnail') {
            const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
            if (allowedTypes.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new Error('Invalid thumbnail type. Please upload JPG or PNG.'));
            }
        } else {
            cb(new Error('Unexpected field'));
        }
    }
}).fields([
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 }
]);

// Process video middleware
const processVideo = async (req, res, next) => {
    if (!req.file) return next();

    try {
        const videoPath = req.file.path;
        const outputDir = path.join(__dirname, '..', 'public', 'uploads', 'videos');
        const thumbnailDir = path.join(__dirname, '..', 'public', 'uploads', 'thumbnails');

        // Ensure directories exist
        await fs.mkdir(outputDir, { recursive: true });
        await fs.mkdir(thumbnailDir, { recursive: true });

        // Move video file to final location
        const finalVideoPath = path.join(outputDir, req.file.filename);
        await fs.rename(videoPath, finalVideoPath);

        // Get video duration using ffprobe
        const ffprobe = require('fluent-ffmpeg').ffprobe;
        try {
            const metadata = await new Promise((resolve, reject) => {
                ffprobe(finalVideoPath, (err, metadata) => {
                    if (err) reject(err);
                    else resolve(metadata);
                });
            });
            req.videoDuration = Math.floor(metadata.format.duration);
        } catch (err) {
            console.error('Error getting video duration:', err);
            req.videoDuration = 0;
        }

        next();
    } catch (error) {
        console.error('Video processing error:', error);
        next(error);
    }
};

// Home/Index route
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 12;
        const skip = (page - 1) * limit;

        const videos = await Video.find()
            .populate('uploader', 'username')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const totalVideos = await Video.countDocuments();
        const totalPages = Math.ceil(totalVideos / limit);

        // Process videos to ensure thumbnails exist
        const processedVideos = await Promise.all(videos.map(async video => {
            const thumbnailPath = path.join(__dirname, '..', 'public', video.thumbnailPath);
            try {
                await fs.access(thumbnailPath);
            } catch (err) {
                // If thumbnail doesn't exist, create an empty one
                const thumbnailDir = path.join(__dirname, '..', 'public', 'uploads', 'thumbnails');
                await fs.mkdir(thumbnailDir, { recursive: true });
                const newThumbnailPath = path.join(thumbnailDir, `${path.parse(video.fileName).name}.jpg`);
                try {
                    await fs.writeFile(newThumbnailPath, '');
                    video.thumbnailPath = `/uploads/thumbnails/${path.parse(video.fileName).name}.jpg`;
                } catch (err) {
                    video.thumbnailPath = '/images/default-thumbnail.jpg';
                }
            }

            return {
                ...video,
                formattedDuration: formatDuration(video.duration || 0)
            };
        }));

        res.render('videos/list', {
            videos: processedVideos,
            currentPage: page,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            nextPage: page + 1,
            prevPage: page - 1,
            user: req.user
        });
    } catch (error) {
        await logError(error, 'List Videos');
        res.status(500).render('error', {
            message: 'Error loading videos',
            error: { status: 500, stack: process.env.NODE_ENV === 'development' ? error.stack : '' }
        });
    }
});

// Upload page route
router.get('/upload', ensureAuthenticated, (req, res) => {
    res.render('videos/upload', {
        user: req.user,
        title: 'Upload Video',
        path: req.path
    });
});

// Feed route
router.get('/feed', ensureAuthenticated, async (req, res) => {
    try {
        const videos = await Video.find({ uploader: { $ne: req.user._id } })
            .sort('-createdAt')
            .populate('uploader', 'username avatar')
            .limit(20);

        res.render('feed', {
            user: req.user,
            videos,
            title: 'Your Feed',
            formatDuration,
            moment,
            path: req.path
        });
    } catch (error) {
        console.error('Feed error:', error);
        res.status(500).send('Error fetching videos');
    }
});

// Watch video route
router.get('/watch/:id', async (req, res) => {
    try {
        const video = await Video.findById(req.params.id)
            .populate('uploader', 'username avatar')
            .populate({
                path: 'comments.user',
                select: 'username avatar'
            });

        if (!video) {
            req.flash('error_msg', 'Video not found');
            return res.redirect('/');
        }

        // Check if video file exists
        const videoPath = path.join(__dirname, '..', 'public', video.videoPath);
        try {
            await fs.access(videoPath);
        } catch (err) {
            req.flash('error_msg', 'Video file not found');
            return res.redirect('/');
        }

        // Check if thumbnail exists, if not use default
        const thumbnailPath = path.join(__dirname, '..', 'public', video.thumbnailPath);
        try {
            await fs.access(thumbnailPath);
        } catch (err) {
            video.thumbnailPath = '/images/default-thumbnail.jpg';
        }

        // Increment view count
        video.views += 1;
        await video.save();

        // Get related videos
        const relatedVideos = await Video.find({
            _id: { $ne: video._id },
            category: video.category
        })
        .populate('uploader', 'username avatar')
        .limit(5);

        // Format video data
        const videoData = {
            _id: video._id,
            title: video.title,
            description: video.description || '',
            videoPath: video.videoPath,
            thumbnailPath: video.thumbnailPath,
            views: video.views,
            likes: video.likes || [],
            dislikes: video.dislikes || [],
            comments: video.comments || [],
            category: video.category,
            uploader: video.uploader,
            createdAt: video.createdAt,
            status: video.status,
            tags: video.tags || [],
            formattedViews: video.views.toLocaleString(),
            formattedDate: moment(video.createdAt).fromNow(),
            formattedDuration: formatDuration(video.duration || 0),
            isLikedBy: function(userId) {
                return userId ? video.likes.includes(userId) : false;
            },
            isDislikedBy: function(userId) {
                return userId ? video.dislikes.includes(userId) : false;
            }
        };

        // Format related videos
        const formattedRelatedVideos = relatedVideos.map(relatedVideo => {
            // Check if thumbnail exists for related video
            const relatedThumbnailPath = path.join(__dirname, '..', 'public', relatedVideo.thumbnailPath);
            try {
                fs.accessSync(relatedThumbnailPath);
            } catch (err) {
                relatedVideo.thumbnailPath = '/images/default-thumbnail.jpg';
            }

            return {
                _id: relatedVideo._id,
                title: relatedVideo.title,
                thumbnailPath: relatedVideo.thumbnailPath,
                views: relatedVideo.views,
                duration: relatedVideo.duration || 0,
                uploader: relatedVideo.uploader,
                createdAt: relatedVideo.createdAt,
                formattedViews: relatedVideo.views.toLocaleString(),
                formattedDate: moment(relatedVideo.createdAt).fromNow(),
                formattedDuration: formatDuration(relatedVideo.duration || 0)
            };
        });

        res.render('videos/watch', {
            video: videoData,
            relatedVideos: formattedRelatedVideos,
            user: req.user,
            title: video.title,
            formatDuration,
            moment,
            path: req.path,
            isAuthenticated: req.isAuthenticated(),
            playlists: [] // Add empty playlists array to prevent undefined error
        });
    } catch (error) {
        console.error('Watch error:', error);
        req.flash('error_msg', 'Error loading video');
        res.redirect('/');
    }
});

// Video upload handler
router.post('/upload', ensureAuthenticated, (req, res) => {
    upload(req, res, async function(err) {
        try {
            if (err instanceof multer.MulterError) {
                await logError(err, 'Multer Upload');
                return res.status(400).json({ error: `Upload error: ${err.message}` });
            } else if (err) {
                await logError(err, 'Upload');
                return res.status(400).json({ error: err.message });
            }

            if (!req.files || !req.files.video) {
                return res.status(400).json({ error: 'No video file uploaded' });
            }

            const videoFile = req.files.video[0];
            const thumbnailFile = req.files.thumbnail ? req.files.thumbnail[0] : null;

            // Create necessary directories
            const finalDir = path.join(__dirname, '..', 'public', 'uploads', 'videos');
            const thumbnailDir = path.join(__dirname, '..', 'public', 'uploads', 'thumbnails');
            const imagesDir = path.join(__dirname, '..', 'public', 'images');
            const logsDir = path.join(__dirname, '..', 'logs');
            
            await fs.mkdir(finalDir, { recursive: true });
            await fs.mkdir(thumbnailDir, { recursive: true });
            await fs.mkdir(imagesDir, { recursive: true });
            await fs.mkdir(logsDir, { recursive: true });

            // Move video file to final location
            const finalPath = path.join(finalDir, videoFile.filename);
            await fs.rename(videoFile.path, finalPath);

            // Get video duration and generate thumbnail using ffmpeg
            const ffmpeg = require('fluent-ffmpeg');
            let duration = 0;
            const thumbnailPath = path.join(thumbnailDir, `${path.parse(videoFile.filename).name}.jpg`);

            try {
                // Get video duration
                const metadata = await new Promise((resolve, reject) => {
                    ffmpeg.ffprobe(finalPath, (err, metadata) => {
                        if (err) reject(err);
                        else resolve(metadata);
                    });
                });
                duration = Math.floor(metadata.format.duration);

                if (thumbnailFile) {
                    // Use uploaded thumbnail
                    await fs.rename(thumbnailFile.path, thumbnailPath);
                } else {
                    // Generate thumbnail from video at 1 second mark
                    await new Promise((resolve, reject) => {
                        ffmpeg(finalPath)
                            .on('end', resolve)
                            .on('error', reject)
                            .screenshots({
                                timestamps: ['1'],
                                filename: path.parse(videoFile.filename).name + '.jpg',
                                folder: thumbnailDir,
                                size: '1280x720'
                            });
                    });
                }
            } catch (err) {
                await logError(err, 'Thumbnail/Duration Processing');
                // Create an empty thumbnail if generation fails
                await fs.writeFile(thumbnailPath, '');
            }

            // Create video document
            const video = new Video({
                title: req.body.title,
                description: req.body.description || '',
                category: req.body.category || 'Other',
                uploader: req.user._id,
                user: req.user._id,
                fileName: videoFile.filename,
                videoPath: `/uploads/videos/${videoFile.filename}`,
                thumbnailPath: `/uploads/thumbnails/${path.parse(videoFile.filename).name}.jpg`,
                duration: duration,
                status: 'ready',
                likes: [],
                dislikes: [],
                comments: []
            });

            await video.save();
            await logError(new Error(`Video created: ${video._id}`), 'Upload Success');

            // Clean up any old thumbnail in videos directory
            const oldThumbnailPath = path.join(finalDir, `${path.parse(videoFile.filename).name}-thumbnail.jpg`);
            try {
                await fs.unlink(oldThumbnailPath);
            } catch (err) {
                // Ignore error if file doesn't exist
            }

            res.status(201).json({ 
                success: true,
                message: 'Video uploaded successfully',
                video: {
                    _id: video._id,
                    title: video.title,
                    redirectUrl: `/videos/watch/${video._id}`
                }
            });
        } catch (error) {
            await logError(error, 'Video Upload');
            
            // Clean up uploaded files if they exist
            if (req.files) {
                if (req.files.video && req.files.video[0].path) {
                    try {
                        await fs.unlink(req.files.video[0].path);
                    } catch (unlinkError) {
                        await logError(unlinkError, 'Video Cleanup');
                    }
                }
                if (req.files.thumbnail && req.files.thumbnail[0].path) {
                    try {
                        await fs.unlink(req.files.thumbnail[0].path);
                    } catch (unlinkError) {
                        await logError(unlinkError, 'Thumbnail Cleanup');
                    }
                }
            }
            res.status(500).json({ error: 'Error processing video upload' });
        }
    });
});

// Like video handler
router.post('/:id/like', ensureAuthenticated, async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const userId = req.user._id;
        const likeIndex = video.likes.indexOf(userId);
        const dislikeIndex = video.dislikes.indexOf(userId);

        if (likeIndex === -1) {
            // Add like
            video.likes.push(userId);
            // Remove dislike if exists
            if (dislikeIndex !== -1) {
                video.dislikes.splice(dislikeIndex, 1);
            }
        } else {
            // Remove like
            video.likes.splice(likeIndex, 1);
        }

        await video.save();

        res.json({
            likes: video.likes.length,
            dislikes: video.dislikes.length,
            liked: likeIndex === -1
        });
    } catch (error) {
        console.error('Like error:', error);
        res.status(500).json({ error: 'Error processing like' });
    }
});

// Dislike video handler
router.post('/:id/dislike', ensureAuthenticated, async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const userId = req.user._id;
        const dislikeIndex = video.dislikes.indexOf(userId);
        const likeIndex = video.likes.indexOf(userId);

        if (dislikeIndex === -1) {
            // Add dislike
            video.dislikes.push(userId);
            // Remove like if exists
            if (likeIndex !== -1) {
                video.likes.splice(likeIndex, 1);
            }
        } else {
            // Remove dislike
            video.dislikes.splice(dislikeIndex, 1);
        }

        await video.save();

        res.json({
            likes: video.likes.length,
            dislikes: video.dislikes.length,
            disliked: dislikeIndex === -1
        });
    } catch (error) {
        console.error('Dislike error:', error);
        res.status(500).json({ error: 'Error processing dislike' });
    }
});

// Add comment handler
router.post('/:id/comments', ensureAuthenticated, async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const comment = {
            text: req.body.text,
            user: req.user._id,
            createdAt: new Date()
        };

        video.comments.push(comment);
        await video.save();

        // Populate user data for the new comment
        await video.populate('comments.user', 'username avatar');
        const newComment = video.comments[video.comments.length - 1];

        res.json({
            comment: newComment,
            username: req.user.username,
            avatar: req.user.avatar
        });
    } catch (error) {
        console.error('Comment error:', error);
        res.status(500).json({ error: 'Error adding comment' });
    }
});

// Delete video handler
router.post('/:id/delete', ensureAuthenticated, async (req, res) => {
    try {
        const video = await Video.findOne({
            _id: req.params.id,
            uploader: req.user._id
        });

        if (!video) {
            return res.status(404).json({ error: 'Video not found or unauthorized' });
        }

        // Delete video and thumbnail files
        const videoPath = path.join(__dirname, '..', 'public', video.videoPath);
        const thumbnailPath = path.join(__dirname, '..', 'public', video.thumbnailPath);

        try {
            await fs.unlink(videoPath);
            await fs.unlink(thumbnailPath);
        } catch (err) {
            console.error('Error deleting files:', err);
        }

        await video.deleteOne();

        res.json({
            success: true,
            message: 'Video deleted successfully'
        });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: 'Error deleting video' });
    }
});

// Edit video handler
router.post('/:id/edit', ensureAuthenticated, async (req, res) => {
    try {
        const video = await Video.findOne({
            _id: req.params.id,
            uploader: req.user._id
        });

        if (!video) {
            return res.status(404).json({ error: 'Video not found or unauthorized' });
        }

        const { title, description } = req.body;

        if (title) video.title = title.trim();
        if (description !== undefined) video.description = description.trim();

        await video.save();

        res.json({
            success: true,
            message: 'Video updated successfully',
            video: video
        });
    } catch (error) {
        console.error('Update error:', error);
        res.status(500).json({ error: 'Error updating video' });
    }
});

module.exports = router; 