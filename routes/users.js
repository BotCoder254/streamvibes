const express = require('express');
const router = express.Router();
const passport = require('passport');
const User = require('../models/User');
const Video = require('../models/Video');
const { ensureAuthenticated } = require('../middleware/auth');
const { sendVerificationEmail, sendPasswordResetEmail, sendPasswordChangedEmail } = require('../services/emailService');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
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

// Login page
router.get('/login', (req, res) => {
    res.render('users/login', { title: 'Login' });
});

// Register page
router.get('/register', (req, res) => {
    res.render('users/register', { title: 'Register' });
});

// Profile page
router.get('/profile', ensureAuthenticated, async (req, res) => {
    try {
        const videos = await Video.find({ user: req.user.id })
            .sort({ createdAt: -1 });

        const totalViews = videos.reduce((acc, video) => acc + (video.views || 0), 0);
        const totalLikes = videos.reduce((acc, video) => acc + (video.likes ? video.likes.length : 0), 0);
        const totalComments = videos.reduce((acc, video) => acc + (video.comments ? video.comments.length : 0), 0);

        res.render('users/profile', {
            user: req.user,
            videos,
            totalViews,
            totalLikes,
            totalComments,
            title: 'My Profile'
        });
    } catch (error) {
        console.error('Profile error:', error);
        req.flash('error_msg', 'Error loading profile');
        res.redirect('/');
    }
});

// Register handle
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        const existingUser = await User.findOne({
            $or: [{ email: email.toLowerCase() }, { username }]
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Email or username already exists'
            });
        }

        const user = new User({
            username,
            email: email.toLowerCase(),
            password
        });

        const verificationToken = user.generateVerificationToken();
        await user.save();
        await sendVerificationEmail(user.email, verificationToken);

        res.status(201).json({
            success: true,
            message: 'Registration successful. Please check your email to verify your account.'
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred during registration'
        });
    }
});

// Login handle
router.post('/login', (req, res, next) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        req.flash('error_msg', 'Please fill in all fields');
        return res.redirect('/users/login');
    }

    passport.authenticate('local', (err, user, info) => {
        if (err) {
            console.error('Login error:', err);
            req.flash('error_msg', 'An error occurred during login');
            return res.redirect('/users/login');
        }

        if (!user) {
            req.flash('error_msg', info.message || 'Invalid credentials');
            return res.redirect('/users/login');
        }

        req.logIn(user, async (err) => {
            if (err) {
                console.error('Session error:', err);
                req.flash('error_msg', 'An error occurred while creating your session');
                return res.redirect('/users/login');
            }

            // Save session explicitly before redirect
            req.session.save((err) => {
                if (err) {
                    console.error('Session save error:', err);
                    req.flash('error_msg', 'Error saving session');
                    return res.redirect('/users/login');
                }

                console.log('Session saved successfully for:', user.email);
                console.log('Session ID:', req.sessionID);
                console.log('Session data:', req.session);
                console.log('User authenticated:', req.isAuthenticated());
                console.log('Session user:', req.user);
                console.log('Passport session:', req.session.passport);

                return res.redirect('/dashboard');
            });
        });
    })(req, res, next);
});

// Logout handle
router.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error('Logout error:', err);
            req.flash('error_msg', 'An error occurred during logout');
            return res.redirect('/');
        }
        req.flash('success_msg', 'You have been logged out');
        res.redirect('/users/login');
    });
});

// Forgot password page
router.get('/forgot-password', (req, res) => {
    res.render('users/forgot-password', { title: 'Forgot Password' });
});

// Reset password page
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

// Forgot password handle
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            req.flash('error_msg', 'No account with that email address exists.');
            return res.redirect('/users/forgot-password');
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
        await user.save();

        const resetUrl = `${req.protocol}://${req.get('host')}/users/reset-password/${resetToken}`;
        const emailSent = await sendPasswordResetEmail(user, resetUrl);

        if (!emailSent) {
            req.flash('error_msg', 'Error sending password reset email. Please try again.');
            return res.redirect('/users/forgot-password');
        }

        req.flash('success_msg', 'Password reset link has been sent to your email.');
        res.redirect('/users/login');
    } catch (error) {
        console.error('Forgot password error:', error);
        req.flash('error_msg', 'Error sending password reset email.');
        res.redirect('/users/forgot-password');
    }
});

// Reset password handle
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

        if (password !== password2) {
            req.flash('error_msg', 'Passwords do not match.');
            return res.redirect(`/users/reset-password/${req.params.token}`);
        }

        if (password.length < 6) {
            req.flash('error_msg', 'Password must be at least 6 characters.');
            return res.redirect(`/users/reset-password/${req.params.token}`);
        }

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        user.password = hash;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        const emailSent = await sendPasswordChangedEmail(user);

        if (!emailSent) {
            req.flash('warning_msg', 'Password updated but confirmation email could not be sent.');
        } else {
            req.flash('success_msg', 'Your password has been updated. Please log in.');
        }

        res.redirect('/users/login');
    } catch (error) {
        console.error('Reset password error:', error);
        req.flash('error_msg', 'Error resetting password.');
        res.redirect('/users/forgot-password');
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
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired verification token'
            });
        }

        user.isVerified = true;
        user.verificationToken = undefined;
        user.verificationTokenExpires = undefined;
        await user.save();

        res.json({
            success: true,
            message: 'Email verified successfully. You can now log in.'
        });
    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred during verification'
        });
    }
});

// Update profile
router.post('/profile/update', ensureAuthenticated, async (req, res) => {
    try {
        const { username, bio, website, twitter, instagram } = req.body;

        if (username !== req.user.username) {
            const existingUser = await User.findOne({ username });
            if (existingUser) {
                req.flash('error_msg', 'Username is already taken');
                return res.redirect('/users/profile');
            }
        }

        await User.findByIdAndUpdate(req.user.id, {
            username,
            bio,
            social: { website, twitter, instagram }
        }, { runValidators: true });

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

        if (req.user.avatar && !req.user.avatar.includes('default-avatar.png')) {
            try {
                await fs.unlink(path.join(__dirname, '../public', req.user.avatar));
            } catch (err) {
                console.error('Error deleting old avatar:', err);
            }
        }

        await User.findByIdAndUpdate(req.user.id, {
            avatar: `/uploads/avatars/${req.file.filename}`
        });

        req.flash('success_msg', 'Profile picture updated successfully');
        res.redirect('/users/profile');
    } catch (error) {
        console.error('Profile picture update error:', error);
        if (req.file) {
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

module.exports = router; 