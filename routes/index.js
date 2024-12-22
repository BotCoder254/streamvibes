const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../config/auth');
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

// Dashboard
router.get('/dashboard', ensureAuthenticated, async function(req, res) {
    try {
        // Get user's videos
        const videos = await Video.find({ user: req.user.id })
            .sort({ createdAt: -1 })
            .limit(5);

        // Get total views
        const totalViews = videos.reduce((acc, video) => acc + (video.views || 0), 0);

        // Get total watch time (in seconds)
        const totalWatchTime = videos.reduce((acc, video) => acc + (video.totalWatchTime || 0), 0);

        // Calculate growth percentages (example values for now)
        const viewsGrowth = 15;
        const watchTimeGrowth = 20;
        const engagementGrowth = -5;
        const subscriberGrowth = 10;

        // Calculate engagement rate
        const totalEngagements = videos.reduce((acc, video) => {
            return acc + (video.likes ? video.likes.length : 0) + (video.comments ? video.comments.length : 0);
        }, 0);
        const engagementRate = totalViews > 0 ? (totalEngagements / totalViews) * 100 : 0;

        // Get subscriber count
        const subscribers = req.user.subscribers ? req.user.subscribers.length : 0;

        // Sample data for charts
        const viewsData = {
            labels: Array.from({length: 7}, (_, i) => {
                const d = new Date();
                d.setDate(d.getDate() - i);
                return d.toLocaleDateString();
            }).reverse(),
            values: Array.from({length: 7}, () => Math.floor(Math.random() * 1000))
        };

        const watchTimeData = {
            labels: ['0-25%', '25-50%', '50-75%', '75-100%'],
            values: [30, 25, 20, 25]
        };

        const demographicsData = {
            labels: ['18-24', '25-34', '35-44', '45-54', '55+'],
            values: [30, 25, 20, 15, 10]
        };

        const trafficData = {
            labels: ['Direct', 'Search', 'Social', 'External'],
            values: [40, 30, 20, 10]
        };

        // Get top performing videos
        const topVideos = videos.map(video => ({
            ...video.toObject(),
            engagement: video.views ? ((video.likes ? video.likes.length : 0) / video.views) * 100 : 0,
            viewsGrowth: Math.floor(Math.random() * 30),
            watchTime: video.totalWatchTime || 0,
            likes: video.likes ? video.likes.length : 0,
            duration: video.duration || 0,
            thumbnail: video.thumbnail || '/images/default-thumbnail.png'
        }));

        res.render('dashboard', {
            user: req.user,
            videos,
            totalViews,
            totalWatchTime,
            viewsGrowth,
            watchTimeGrowth,
            engagementRate,
            engagementGrowth,
            subscribers,
            subscriberGrowth,
            viewsData,
            watchTimeData,
            demographicsData,
            trafficData,
            topVideos,
            formatWatchTime,
            formatDuration,
            path: '/dashboard'
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        req.flash('error_msg', 'Error loading dashboard');
        res.redirect('/');
    }
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

// Profile page
router.get('/profile', ensureAuthenticated, async function(req, res) {
    try {
        // Get user's videos
        const videos = await Video.find({ user: req.user.id })
            .sort({ createdAt: -1 });

        // Get total stats
        const totalViews = videos.reduce((acc, video) => acc + (video.views || 0), 0);
        const totalLikes = videos.reduce((acc, video) => acc + (video.likes ? video.likes.length : 0), 0);
        const totalComments = videos.reduce((acc, video) => acc + (video.comments ? video.comments.length : 0), 0);

        res.render('profile', {
            user: req.user,
            videos,
            totalViews,
            totalLikes,
            totalComments,
            title: 'My Profile',
            formatDuration,
            path: '/profile'
        });
    } catch (error) {
        console.error('Profile error:', error);
        req.flash('error_msg', 'Error loading profile');
        res.redirect('/');
    }
});

// Update profile
router.post('/profile/update', ensureAuthenticated, async function(req, res) {
    try {
        const { username, bio, website, twitter, instagram } = req.body;
        const updates = {
            username,
            bio,
            social: {
                website,
                twitter,
                instagram
            }
        };

        // Update user
        await User.findByIdAndUpdate(req.user.id, updates, { runValidators: true });
        req.flash('success_msg', 'Profile updated successfully');
        res.redirect('/profile');
    } catch (error) {
        console.error('Profile update error:', error);
        req.flash('error_msg', 'Error updating profile');
        res.redirect('/profile');
    }
});

// Update profile picture
router.post('/profile/picture', ensureAuthenticated, async function(req, res) {
    try {
        if (!req.files || !req.files.avatar) {
            req.flash('error_msg', 'Please select an image');
            return res.redirect('/profile');
        }

        const avatar = req.files.avatar;
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
        
        if (!allowedTypes.includes(avatar.mimetype)) {
            req.flash('error_msg', 'Please upload an image file (JPG, PNG, GIF)');
            return res.redirect('/profile');
        }

        const fileName = `avatar-${req.user.id}-${Date.now()}${path.extname(avatar.name)}`;
        await avatar.mv(path.join(__dirname, '../public/uploads/avatars', fileName));

        await User.findByIdAndUpdate(req.user.id, {
            avatar: `/uploads/avatars/${fileName}`
        });

        req.flash('success_msg', 'Profile picture updated successfully');
        res.redirect('/profile');
    } catch (error) {
        console.error('Profile picture update error:', error);
        req.flash('error_msg', 'Error updating profile picture');
        res.redirect('/profile');
    }
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