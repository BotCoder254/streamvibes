const express = require('express');
const router = express.Router();
const passport = require('passport');
const User = require('../models/User');
const Video = require('../models/Video');
const { ensureAuthenticated } = require('../config/auth');
const { sendEmail } = require('../services/emailService');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const multer = require('multer');

// Configure multer for avatar uploads
const avatarStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../public/uploads/avatars');
        fs.mkdir(uploadDir, { recursive: true })
            .then(() => cb(null, uploadDir))
            .catch(err => cb(err));
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = `avatar-${req.user.id}-${Date.now()}${path.extname(file.originalname)}`;
        cb(null, uniqueSuffix);
    }
});

const avatarUpload = multer({
    storage: avatarStorage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB max file size
    },
    fileFilter: function (req, file, cb) {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Please upload an image file (JPG, PNG, GIF)'), false);
        }
    }
});

// Helper function to format duration
function formatDuration(seconds) {
    if (!seconds) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Login page
router.get('/login', (req, res) => {
    res.render('users/login');
});

// Register page
router.get('/register', (req, res) => {
    res.render('users/register');
});

// Profile page
router.get('/profile', ensureAuthenticated, async (req, res) => {
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
            formatDuration
        });
    } catch (error) {
        console.error('Profile error:', error);
        req.flash('error_msg', 'Error loading profile');
        res.redirect('/');
    }
});

// Update profile
router.post('/profile/update', ensureAuthenticated, async (req, res) => {
    try {
        const { username, bio, website, twitter, instagram } = req.body;

        // Check if username is taken by another user
        if (username !== req.user.username) {
            const existingUser = await User.findOne({ username });
            if (existingUser) {
                req.flash('error_msg', 'Username is already taken');
                return res.redirect('/users/profile');
            }
        }

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
        res.redirect('/users/profile');
    } catch (error) {
        console.error('Profile update error:', error);
        req.flash('error_msg', 'Error updating profile');
        res.redirect('/users/profile');
    }
});

// Update profile picture
router.post('/profile/picture', ensureAuthenticated, avatarUpload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            req.flash('error_msg', 'Please select an image');
            return res.redirect('/users/profile');
        }

        // Delete old avatar if it exists and isn't the default
        if (req.user.avatar && !req.user.avatar.includes('default-avatar.png')) {
            const oldAvatarPath = path.join(__dirname, '../public', req.user.avatar);
            try {
                await fs.unlink(oldAvatarPath);
            } catch (err) {
                console.error('Error deleting old avatar:', err);
                // Continue even if old file doesn't exist
            }
        }

        // Update user avatar in database
        await User.findByIdAndUpdate(req.user.id, {
            avatar: `/uploads/avatars/${req.file.filename}`
        });

        req.flash('success_msg', 'Profile picture updated successfully');
        res.redirect('/users/profile');
    } catch (error) {
        console.error('Profile picture update error:', error);
        // Clean up uploaded file if it exists
        if (req.file && req.file.path) {
            try {
                await fs.unlink(req.file.path);
            } catch (unlinkError) {
                console.error('Error deleting uploaded file:', unlinkError);
            }
        }
        req.flash('error_msg', 'Error updating profile picture');
        res.redirect('/users/profile');
    }
});

// Register handle
router.post('/register', async (req, res) => {
    try {
        const { username, email, password, password2 } = req.body;
        const errors = [];

        // Check required fields
        if (!username || !email || !password || !password2) {
            errors.push({ msg: 'Please fill in all fields' });
        }

        // Check passwords match
        if (password !== password2) {
            errors.push({ msg: 'Passwords do not match' });
        }

        // Check password length
        if (password.length < 6) {
            errors.push({ msg: 'Password should be at least 6 characters' });
        }

        if (errors.length > 0) {
            return res.render('users/register', {
                errors,
                username,
                email,
                error_msg: '',
                success_msg: ''
            });
        }

        // Check if user exists
        let userExists = await User.findOne({ 
            $or: [
                { email: email.toLowerCase() },
                { username: username }
            ]
        });

        if (userExists) {
            if (userExists.email === email.toLowerCase()) {
                errors.push({ msg: 'Email is already registered' });
            }
            if (userExists.username === username) {
                errors.push({ msg: 'Username is already taken' });
            }
            return res.render('users/register', {
                errors,
                username,
                email,
                error_msg: '',
                success_msg: ''
            });
        }

        // Create new user
        const user = new User({
            username,
            email: email.toLowerCase(),
            password
        });

        // Generate verification token
        const verificationToken = user.generateVerificationToken();

        // Save user
        await user.save();

        // Send verification email
        const emailSent = await emailService.sendVerificationEmail(user, verificationToken);
        
        if (!emailSent) {
            req.flash('warning_msg', 'Account created but verification email could not be sent. Please contact support.');
        } else {
            req.flash('success_msg', 'Registration successful! Please check your email to verify your account.');
        }
        
        res.redirect('/users/login');
    } catch (error) {
        console.error('Registration error:', error);
        const errors = [];
        if (error.name === 'ValidationError') {
            Object.values(error.errors).forEach(err => {
                errors.push({ msg: err.message });
            });
            return res.render('users/register', {
                errors,
                username: req.body.username,
                email: req.body.email,
                error_msg: '',
                success_msg: ''
            });
        }
        req.flash('error_msg', 'An error occurred during registration. Please try again.');
        res.redirect('/users/register');
    }
});

// Email verification
router.get('/verify/:token', async (req, res) => {
    try {
        const user = await User.findOne({
            verificationToken: req.params.token,
            verificationTokenExpires: { $gt: Date.now() }
        });

        if (!user) {
            req.flash('error_msg', 'Invalid or expired verification token');
            return res.redirect('/users/login');
        }

        user.isVerified = true;
        user.verificationToken = undefined;
        user.verificationTokenExpires = undefined;
        await user.save();

        req.flash('success_msg', 'Your account has been verified. You can now log in.');
        res.redirect('/users/login');
    } catch (error) {
        console.error('Verification error:', error);
        req.flash('error_msg', 'An error occurred during verification');
        res.redirect('/users/login');
    }
});

// Login handle
router.post('/login', (req, res, next) => {
    passport.authenticate('local', {
        successRedirect: '/dashboard',
        failureRedirect: '/users/login',
        failureFlash: true
    })(req, res, next);
});

// Logout handle
router.get('/logout', (req, res) => {
    req.logout(() => {
        req.flash('success_msg', 'You are logged out');
        res.redirect('/users/login');
    });
});

// Forgot password page
router.get('/forgot-password', (req, res) => {
    res.render('users/forgot-password');
});

// Reset password page
router.get('/reset-password/:token', (req, res) => {
    res.render('users/reset-password', { token: req.params.token });
});

// Forgot password route
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            req.flash('error_msg', 'No account with that email address exists.');
            return res.redirect('/users/forgot-password');
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = Date.now() + 3600000; // 1 hour

        // Update user with reset token
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = resetTokenExpiry;
        await user.save();

        // Send reset email
        const resetUrl = `${req.protocol}://${req.get('host')}/users/reset-password/${resetToken}`;
        
        await sendEmail({
            to: user.email,
            subject: 'Password Reset Request',
            template: 'reset-password',
            context: {
                resetUrl,
                username: user.username
            }
        });

        req.flash('success_msg', 'Password reset link has been sent to your email.');
        res.redirect('/users/login');
    } catch (error) {
        console.error('Forgot password error:', error);
        req.flash('error_msg', 'Error sending password reset email.');
        res.redirect('/users/forgot-password');
    }
});

// Reset password form route
router.get('/reset-password/:token', async (req, res) => {
    try {
        const user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            req.flash('error_msg', 'Password reset token is invalid or has expired.');
            return res.redirect('/users/forgot-password');
        }

        res.render('users/reset-password', {
            token: req.params.token,
            title: 'Reset Password'
        });
    } catch (error) {
        console.error('Reset password error:', error);
        req.flash('error_msg', 'Error processing password reset.');
        res.redirect('/users/forgot-password');
    }
});

// Reset password action route
router.post('/reset-password/:token', async (req, res) => {
    try {
        const user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            req.flash('error_msg', 'Password reset token is invalid or has expired.');
            return res.redirect('/users/forgot-password');
        }

        const { password, password2 } = req.body;

        // Validate password
        if (password !== password2) {
            req.flash('error_msg', 'Passwords do not match.');
            return res.redirect(`/users/reset-password/${req.params.token}`);
        }

        if (password.length < 6) {
            req.flash('error_msg', 'Password must be at least 6 characters.');
            return res.redirect(`/users/reset-password/${req.params.token}`);
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        // Update user
        user.password = hash;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        // Send confirmation email
        await sendEmail({
            to: user.email,
            subject: 'Your password has been changed',
            template: 'password-changed',
            context: {
                username: user.username
            }
        });

        req.flash('success_msg', 'Your password has been updated. Please log in.');
        res.redirect('/users/login');
    } catch (error) {
        console.error('Reset password error:', error);
        req.flash('error_msg', 'Error resetting password.');
        res.redirect('/users/forgot-password');
    }
});

module.exports = router; 