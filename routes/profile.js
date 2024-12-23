const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Video = require('../models/Video');
const { ensureAuthenticated } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Verify User model is loaded
console.log('User model schema:', User.schema.paths);
console.log('User model methods:', Object.keys(User.prototype));

// Configure multer for avatar uploads
const storage = multer.diskStorage({
    destination: async function (req, file, cb) {
        const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'avatars');
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (err) {
            cb(err);
        }
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB max file size
    },
    fileFilter: function (req, file, cb) {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG and PNG are allowed.'));
        }
    }
}).single('avatar');

// Session verification middleware
router.use((req, res, next) => {
    console.log('Session middleware - isAuthenticated:', req.isAuthenticated());
    console.log('Session middleware - user:', req.user);
    console.log('Session middleware - session:', req.session);

    if (!req.isAuthenticated()) {
        console.error('Session middleware - User not authenticated');
        return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!req.user) {
        console.error('Session middleware - No user in request');
        return res.status(401).json({ error: 'No user found' });
    }

    if (!mongoose.Types.ObjectId.isValid(req.user._id)) {
        console.error('Session middleware - Invalid user ID:', req.user._id);
        return res.status(400).json({ error: 'Invalid user ID' });
    }

    next();
});

// Profile page route
router.get('/', ensureAuthenticated, async (req, res) => {
    try {
        console.log('Profile route - User ID:', req.user._id);
        const user = await User.findById(req.user._id).select('-password');
        
        if (!user) {
            console.error('Profile route - User not found in database');
            req.flash('error_msg', 'User not found');
            return res.redirect('/');
        }

        // Get user's videos
        const videos = await Video.find({ user: req.user._id })
            .sort({ createdAt: -1 });

        // Get total stats
        const totalViews = videos.reduce((acc, video) => acc + (video.views || 0), 0);
        const totalLikes = videos.reduce((acc, video) => acc + (video.likes ? video.likes.length : 0), 0);
        const totalComments = videos.reduce((acc, video) => acc + (video.comments ? video.comments.length : 0), 0);

        console.log('Profile route - User found:', {
            username: user.username,
            email: user.email,
            avatar: user.avatar
        });

        res.render('profile/index', {
            user: user,
            videos,
            totalViews,
            totalLikes,
            totalComments,
            title: 'Profile',
            path: '/profile',
            messages: {
                error: req.flash('error_msg'),
                success: req.flash('success_msg')
            }
        });
    } catch (error) {
        console.error('Profile route error:', error);
        req.flash('error_msg', 'Error loading profile');
        res.redirect('/');
    }
});

// Update profile route
router.post('/update', ensureAuthenticated, async (req, res) => {
    console.log('Update profile route - Starting update process');
    try {
        upload(req, res, async function(err) {
            if (err instanceof multer.MulterError) {
                console.error('Multer upload error:', err);
                return res.status(400).json({ error: `Upload error: ${err.message}` });
            } else if (err) {
                console.error('General upload error:', err);
                return res.status(400).json({ error: err.message });
            }

            console.log('Update profile - Request body:', req.body);
            console.log('Update profile - File:', req.file);

            const { username, email, bio, website, twitter, instagram } = req.body;
            const user = await User.findById(req.user._id);

            if (!user) {
                console.error('Update profile - User not found:', req.user._id);
                return res.status(404).json({ error: 'User not found' });
            }

            // Check if username is taken by another user
            if (username && username !== user.username) {
                const existingUser = await User.findOne({ username });
                if (existingUser) {
                    console.error('Update profile - Username taken:', username);
                    return res.status(400).json({ error: 'Username is already taken' });
                }
            }

            // Check if email is taken by another user
            if (email && email !== user.email) {
                const existingUser = await User.findOne({ email });
                if (existingUser) {
                    console.error('Update profile - Email taken:', email);
                    return res.status(400).json({ error: 'Email is already taken' });
                }
            }

            // Update user fields
            if (username) user.username = username;
            if (email) user.email = email;
            if (bio !== undefined) user.bio = bio;

            // Update social links
            user.social = {
                website: website || '',
                twitter: twitter || '',
                instagram: instagram || ''
            };

            // Handle avatar upload
            if (req.file) {
                console.log('Update profile - Processing avatar upload');
                // Delete old avatar if it exists and is not the default
                if (user.avatar && !user.avatar.includes('default-avatar') && user.avatar.startsWith('/uploads/')) {
                    try {
                        const oldAvatarPath = path.join(__dirname, '..', 'public', user.avatar);
                        await fs.unlink(oldAvatarPath);
                        console.log('Update profile - Deleted old avatar:', oldAvatarPath);
                    } catch (error) {
                        console.error('Error deleting old avatar:', error);
                    }
                }
                user.avatar = `/uploads/avatars/${req.file.filename}`;
                console.log('Update profile - New avatar path:', user.avatar);
            }

            await user.save();
            console.log('Update profile - User updated successfully');

            res.json({
                success: true,
                message: 'Profile updated successfully',
                user: {
                    username: user.username,
                    email: user.email,
                    bio: user.bio,
                    avatar: user.avatar,
                    social: user.social
                }
            });
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Error updating profile: ' + error.message });
    }
});

// Change password route
router.post('/change-password', ensureAuthenticated, async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;

        // Validate passwords
        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({ error: 'All password fields are required' });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({ error: 'New passwords do not match' });
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check current password
        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(400).json({ error: 'Current password is incorrect' });
        }

        // Update password
        user.password = newPassword;
        await user.save();

        res.json({
            success: true,
            message: 'Password updated successfully'
        });
    } catch (error) {
        console.error('Password change error:', error);
        res.status(500).json({ error: 'Error changing password' });
    }
});

// Delete account route
router.post('/delete', ensureAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Delete user's avatar if it's not the default
        if (user.avatar && !user.avatar.includes('default-avatar') && user.avatar.startsWith('/uploads/')) {
            try {
                const avatarPath = path.join(__dirname, '..', 'public', user.avatar);
                await fs.unlink(avatarPath);
            } catch (error) {
                console.error('Error deleting avatar:', error);
            }
        }

        await user.deleteOne();
        req.logout(function(err) {
            if (err) {
                console.error('Logout error:', err);
            }
        });

        res.json({
            success: true,
            message: 'Account deleted successfully'
        });
    } catch (error) {
        console.error('Delete account error:', error);
        res.status(500).json({ error: 'Error deleting account' });
    }
});

module.exports = router; 