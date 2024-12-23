const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middleware/auth');
const Video = require('../models/Video');
const User = require('../models/User');
const path = require('path');

// Helper function to format watch time
function formatWatchTime(seconds) {
    if (!seconds) return '0 min';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes} min`;
    }
}

// Helper function to format duration
function formatDuration(seconds) {
    if (!seconds) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Landing page
router.get('/', async function(req, res) {
    if (req.isAuthenticated()) {
        try {
            const videos = await Video.find()
                .sort({ createdAt: -1 })
                .populate({
                    path: 'uploader',
                    select: 'username avatar'
                })
                .limit(20);

            // Transform the data to match the template expectations
            const transformedVideos = videos.map(video => ({
                ...video.toObject(),
                user: video.uploader, // Map uploader to user for template compatibility
                thumbnailPath: video.thumbnailPath,
                videoPath: video.videoPath
            }));

            return res.render('feed', {
                user: req.user,
                videos: transformedVideos,
                title: 'Home',
                formatDuration,
                path: '/'
            });
        } catch (error) {
            console.error('Feed error:', error);
            req.flash('error_msg', 'Error loading videos');
            return res.render('feed', {
                user: req.user,
                videos: [],
                title: 'Home',
                formatDuration,
                path: '/'
            });
        }
    }
    res.render('index', {
        user: req.user,
        title: 'Welcome to StreamVista',
        path: '/'
    });
});

// About page
router.get('/about', function(req, res) {
    res.render('about', {
        user: req.user,
        title: 'About StreamVista',
        path: '/about'
    });
});

// Contact page
router.get('/contact', function(req, res) {
    res.render('contact', {
        user: req.user,
        title: 'Contact Us',
        path: '/contact'
    });
});

// Terms page
router.get('/terms', function(req, res) {
    res.render('terms', {
        user: req.user,
        title: 'Terms of Service',
        path: '/terms'
    });
});

// Privacy page
router.get('/privacy', function(req, res) {
    res.render('privacy', {
        user: req.user,
        title: 'Privacy Policy',
        path: '/privacy'
    });
});

// Feed page
router.get('/feed', ensureAuthenticated, async function(req, res) {
    try {
        const videos = await Video.find({ user: { $ne: req.user._id } })
            .sort({ createdAt: -1 })
            .populate('user', 'username avatar')
            .limit(20);

        res.render('feed', {
            user: req.user,
            videos,
            title: 'Your Feed',
            formatDuration,
            path: '/feed'
        });
    } catch (error) {
        console.error('Feed error:', error);
        res.status(500).send('Error fetching videos');
    }
});

module.exports = router; 