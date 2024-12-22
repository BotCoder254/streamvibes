const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const { processVideo } = require('../middleware/videoProcessor');
const Video = require('../models/Video');
const { isAuthenticated } = require('../middleware/auth');
const moment = require('moment');
const multer = require('multer');
const Playlist = require('../models/Playlist');

// Configure multer storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const tempDir = path.join(__dirname, '..', 'uploads', 'temp');
        // Ensure temp directory exists
        fs.mkdir(tempDir, { recursive: true })
            .then(() => cb(null, tempDir))
            .catch(err => cb(err));
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
        const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Please upload MP4, MOV, AVI, or MKV.'));
        }
    }
});

// Get upload page
router.get('/upload', isAuthenticated, (req, res) => {
    res.render('videos/upload', {
        user: req.user,
        title: 'Upload Video'
    });
});

// Video upload route
router.post('/upload', isAuthenticated, upload.single('video'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No video file uploaded' });
        }

        const { title, description, category } = req.body;
        
        if (!title || !description || !category) {
            return res.status(400).json({ error: 'Please provide all required fields' });
        }

        // Convert category to proper case to match enum
        const categoryMap = {
            'entertainment': 'Entertainment',
            'education': 'Education',
            'sports': 'Sports',
            'technology': 'Technology',
            'music': 'Music',
            'gaming': 'Gaming',
            'news': 'News',
            'other': 'Other'
        };

        const properCategory = categoryMap[category.toLowerCase()];
        if (!properCategory) {
            return res.status(400).json({ error: 'Invalid category selected' });
        }

        // Generate unique filename
        const videoId = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        const outputDir = path.join(__dirname, '..', 'public', 'uploads', 'videos');

        // Ensure output directory exists
        await fs.mkdir(outputDir, { recursive: true });

        // Process the video
        const { duration, thumbnailPath, processedVideoPath } = await processVideo(
            req.file.path,
            outputDir,
            videoId
        );

        // Create video document
        const video = new Video({
            title,
            description,
            category: properCategory,
            fileName: videoId,
            duration,
            thumbnailPath: `/uploads/videos/${path.basename(thumbnailPath)}`,
            videoPath: `/uploads/videos/${path.basename(processedVideoPath)}`,
            uploader: req.user._id,
            user: req.user._id,
            status: 'ready',
            views: 0,
            likes: [],
            dislikes: [],
            comments: [],
            tags: []
        });

        await video.save();
        await video.populate('uploader', 'username avatar');

        // Clean up temporary file
        try {
            await fs.unlink(req.file.path);
        } catch (unlinkError) {
            console.error('Error deleting temporary file:', unlinkError);
        }

        res.status(201).json({
            message: 'Video uploaded successfully',
            video: {
                _id: video._id,
                title: video.title,
                thumbnail: video.thumbnailPath,
                videoPath: video.videoPath,
                redirectUrl: '/'
            }
        });
    } catch (error) {
        console.error('Upload error:', error);
        if (req.file && req.file.path) {
            try {
                await fs.unlink(req.file.path);
            } catch (unlinkError) {
                console.error('Error deleting temporary file:', unlinkError);
            }
        }
        res.status(500).json({ error: 'Error uploading video: ' + error.message });
    }
});

// Get video list
router.get('/', async (req, res) => {
    try {
        const { category, search, sort = '-createdAt' } = req.query;
        let query = {};

        if (category) {
            query.category = category;
        }

        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        const videos = await Video.find(query)
            .sort(sort)
            .populate('uploader', 'username avatar')
            .lean();

        res.json(videos);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching videos' });
    }
});

// Feed route (handle /videos/feed)
router.get('/feed', isAuthenticated, async (req, res) => {
    try {
        const videos = await Video.find({ uploader: { $ne: req.user._id } })
            .sort({ createdAt: -1 })
            .populate({
                path: 'uploader',
                select: 'username avatar'
            })
            .limit(20);

        // Transform the data to match the template expectations
        const transformedVideos = videos.map(video => ({
            ...video.toObject(),
            user: video.uploader // Map uploader to user for template compatibility
        }));

        res.render('feed', {
            user: req.user,
            videos: transformedVideos,
            title: 'Your Feed',
            formatDuration
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
            })
            .populate({
                path: 'comments.replies.user',
                select: 'username avatar'
            });

        if (!video) {
            return res.status(404).render('errors/404', {
                user: req.user,
                title: 'Video Not Found',
                path: req.path
            });
        }

        // Fetch related videos based on category and exclude current video
        const relatedVideos = await Video.find({
            _id: { $ne: video._id },
            category: video.category
        })
        .populate('uploader', 'username avatar')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

        // Increment view count
        await Video.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });

        // Check if user has liked or disliked the video
        const userLiked = req.user ? video.likes.includes(req.user._id) : false;
        const userDisliked = req.user ? video.dislikes.includes(req.user._id) : false;

        // Fetch user's playlists if logged in
        let userPlaylists = [];
        if (req.user) {
            userPlaylists = await Playlist.find({ user: req.user._id }).lean();
        }

        // Transform video data
        const videoData = {
            ...video.toObject(),
            user: video.uploader,
            videoPath: video.videoPath,
            thumbnailPath: video.thumbnailPath,
            tags: video.tags || [],
            isLikedBy: () => userLiked,
            isDislikedBy: () => userDisliked,
            formattedDuration: formatDuration(video.duration),
            formattedDate: new Date(video.createdAt).toLocaleDateString(),
            formattedViews: video.views.toLocaleString(),
            commentCount: video.comments ? video.comments.length : 0
        };

        res.render('videos/watch', {
            user: req.user,
            video: videoData,
            relatedVideos: relatedVideos.map(relatedVideo => ({
                ...relatedVideo,
                user: relatedVideo.uploader,
                thumbnail: relatedVideo.thumbnailPath,
                tags: relatedVideo.tags || [],
                formattedDuration: formatDuration(relatedVideo.duration),
                formattedDate: new Date(relatedVideo.createdAt).toLocaleDateString(),
                formattedViews: relatedVideo.views.toLocaleString()
            })),
            title: video.title,
            formatDuration,
            path: req.path,
            playlists: userPlaylists,
            isAuthenticated: !!req.user
        });
    } catch (error) {
        console.error('Watch error:', error);
        res.status(500).render('errors/500', {
            user: req.user,
            title: 'Error',
            path: req.path
        });
    }
});

// Get video by ID (API route)
router.get('/:id', async (req, res) => {
    try {
        const video = await Video.findById(req.params.id)
            .populate('uploader', 'username avatar')
            .lean();

        if (!video) {
            return res.status(404).json({ error: 'Video not found' });
        }

        // Increment view count
        await Video.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });

        res.json(video);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching video' });
    }
});

// Update video
router.put('/:id', isAuthenticated, async (req, res) => {
    try {
        const video = await Video.findOne({
            _id: req.params.id,
            uploader: req.user._id
        });

        if (!video) {
            return res.status(404).json({ error: 'Video not found or unauthorized' });
        }

        const { title, description, category } = req.body;

        // Validate category if provided
        if (category) {
            const categoryMap = {
                'entertainment': 'Entertainment',
                'education': 'Education',
                'sports': 'Sports',
                'technology': 'Technology',
                'music': 'Music',
                'gaming': 'Gaming',
                'news': 'News',
                'other': 'Other'
            };
            const properCategory = categoryMap[category.toLowerCase()];
            if (!properCategory) {
                return res.status(400).json({ error: 'Invalid category selected' });
            }
            video.category = properCategory;
        }

        // Update fields if provided
        if (title) video.title = title;
        if (description) video.description = description;

        await video.save();
        await video.populate('uploader', 'username avatar');

        res.json({
            message: 'Video updated successfully',
            video: video
        });
    } catch (error) {
        console.error('Update error:', error);
        res.status(500).json({ error: 'Error updating video' });
    }
});

// Delete video
router.delete('/:id', isAuthenticated, async (req, res) => {
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

        // Delete files if they exist
        try {
            if (await fs.access(videoPath).then(() => true).catch(() => false)) {
                await fs.unlink(videoPath);
            }
            if (await fs.access(thumbnailPath).then(() => true).catch(() => false)) {
                await fs.unlink(thumbnailPath);
            }
        } catch (error) {
            console.error('Error deleting video files:', error);
            // Continue with video document deletion even if file deletion fails
        }

        // Delete the video document
        await Video.deleteOne({ _id: video._id });

        res.json({ 
            message: 'Video deleted successfully',
            videoId: video._id
        });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: 'Error deleting video' });
    }
});

// Like video
router.post('/:id/like', isAuthenticated, async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        
        if (!video) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const userId = req.user._id;
        const userLikedIndex = video.likes.indexOf(userId);
        const userDislikedIndex = video.dislikes.indexOf(userId);

        // Remove from dislikes if present
        if (userDislikedIndex > -1) {
            video.dislikes.splice(userDislikedIndex, 1);
        }

        // Toggle like
        let liked = false;
        if (userLikedIndex > -1) {
            video.likes.splice(userLikedIndex, 1);
        } else {
            video.likes.push(userId);
            liked = true;
        }

        await video.save();

        res.json({
            likes: video.likes.length,
            dislikes: video.dislikes.length,
            liked: liked
        });
    } catch (error) {
        console.error('Like error:', error);
        res.status(500).json({ error: 'Error updating video likes' });
    }
});

// Dislike video
router.post('/:id/dislike', isAuthenticated, async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        
        if (!video) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const userId = req.user._id;
        const userLikedIndex = video.likes.indexOf(userId);
        const userDislikedIndex = video.dislikes.indexOf(userId);

        // Remove from likes if present
        if (userLikedIndex > -1) {
            video.likes.splice(userLikedIndex, 1);
        }

        // Toggle dislike
        let disliked = false;
        if (userDislikedIndex > -1) {
            video.dislikes.splice(userDislikedIndex, 1);
        } else {
            video.dislikes.push(userId);
            disliked = true;
        }

        await video.save();

        res.json({
            likes: video.likes.length,
            dislikes: video.dislikes.length,
            disliked: disliked
        });
    } catch (error) {
        console.error('Dislike error:', error);
        res.status(500).json({ error: 'Error updating video dislikes' });
    }
});

// Add comment
router.post('/:id/comments', isAuthenticated, async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        
        if (!video) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const { text, parentCommentId } = req.body;

        if (!text || text.trim().length === 0) {
            return res.status(400).json({ error: 'Comment text is required' });
        }

        const newComment = {
            user: req.user._id,
            text: text.trim(),
            createdAt: new Date()
        };

        if (parentCommentId) {
            // This is a reply to another comment
            const parentComment = video.comments.id(parentCommentId);
            if (!parentComment) {
                return res.status(404).json({ error: 'Parent comment not found' });
            }
            if (!parentComment.replies) {
                parentComment.replies = [];
            }
            parentComment.replies.push(newComment);
        } else {
            // This is a top-level comment
            video.comments.push(newComment);
        }

        await video.save();
        
        // Populate user information for the new comment
        const populatedVideo = await Video.findById(video._id)
            .populate('comments.user', 'username avatar')
            .populate('comments.replies.user', 'username avatar');

        const addedComment = parentCommentId 
            ? populatedVideo.comments.id(parentCommentId).replies[populatedVideo.comments.id(parentCommentId).replies.length - 1]
            : populatedVideo.comments[populatedVideo.comments.length - 1];

        res.json({
            message: 'Comment added successfully',
            comment: addedComment
        });
    } catch (error) {
        console.error('Comment error:', error);
        res.status(500).json({ error: 'Error adding comment' });
    }
});

// Update comment
router.put('/:id/comments/:commentId', isAuthenticated, async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        
        if (!video) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const comment = video.comments.id(req.params.commentId);
        if (!comment) {
            return res.status(404).json({ error: 'Comment not found' });
        }

        if (comment.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Not authorized to edit this comment' });
        }

        const { text } = req.body;
        if (!text || text.trim().length === 0) {
            return res.status(400).json({ error: 'Comment text is required' });
        }

        comment.text = text.trim();
        comment.edited = true;
        comment.editedAt = new Date();

        await video.save();
        await video.populate('comments.user', 'username avatar');

        res.json({
            message: 'Comment updated successfully',
            comment: comment
        });
    } catch (error) {
        console.error('Comment update error:', error);
        res.status(500).json({ error: 'Error updating comment' });
    }
});

// Delete comment
router.delete('/:id/comments/:commentId', isAuthenticated, async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        
        if (!video) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const comment = video.comments.id(req.params.commentId);
        if (!comment) {
            return res.status(404).json({ error: 'Comment not found' });
        }

        if (comment.user.toString() !== req.user._id.toString() && 
            video.uploader.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Not authorized to delete this comment' });
        }

        comment.remove();
        await video.save();

        res.json({
            message: 'Comment deleted successfully',
            commentId: req.params.commentId
        });
    } catch (error) {
        console.error('Comment delete error:', error);
        res.status(500).json({ error: 'Error deleting comment' });
    }
});

// Get video comments
router.get('/:id/comments', async (req, res) => {
    try {
        const video = await Video.findById(req.params.id)
            .populate({
                path: 'comments.user',
                select: 'username avatar'
            })
            .populate({
                path: 'comments.replies.user',
                select: 'username avatar'
            })
            .select('comments');

        if (!video) {
            return res.status(404).json({ error: 'Video not found' });
        }

        res.json({
            comments: video.comments
        });
    } catch (error) {
        console.error('Comments fetch error:', error);
        res.status(500).json({ error: 'Error fetching comments' });
    }
});

// Helper function to format duration
function formatDuration(seconds) {
    if (!seconds) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Edit video (POST version)
router.post('/:id/edit', isAuthenticated, async (req, res) => {
    try {
        const video = await Video.findOne({
            _id: req.params.id,
            uploader: req.user._id
        });

        if (!video) {
            return res.status(404).json({ error: 'Video not found or unauthorized' });
        }

        const { title, description, tags } = req.body;

        // Update fields if provided
        if (title) video.title = title.trim();
        if (description !== undefined) video.description = description.trim();
        if (tags) video.tags = tags;

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

// Delete video (POST version)
router.post('/:id/delete', isAuthenticated, async (req, res) => {
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

        // Delete files if they exist
        try {
            if (await fs.access(videoPath).then(() => true).catch(() => false)) {
                await fs.unlink(videoPath);
            }
            if (await fs.access(thumbnailPath).then(() => true).catch(() => false)) {
                await fs.unlink(thumbnailPath);
            }
        } catch (error) {
            console.error('Error deleting video files:', error);
            // Continue with video document deletion even if file deletion fails
        }

        // Delete the video document
        await Video.deleteOne({ _id: video._id });

        res.json({ 
            success: true,
            message: 'Video deleted successfully',
            videoId: video._id
        });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: 'Error deleting video' });
    }
});

module.exports = router; 