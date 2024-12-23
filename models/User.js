const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        index: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        index: true
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    avatar: {
        type: String,
        default: '/images/default-avatar.png'
    },
    bio: {
        type: String,
        maxlength: 500
    },
    social: {
        website: String,
        twitter: String,
        instagram: String
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    verificationToken: {
        type: String,
        sparse: true,
        index: true
    },
    verificationTokenExpires: Date,
    resetPasswordToken: {
        type: String,
        sparse: true,
        index: true
    },
    resetPasswordExpires: Date,
    subscribers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    subscribedTo: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }]
}, {
    timestamps: true
});

// Hash password before saving (only if modified)
userSchema.pre('save', async function(next) {
    try {
        if (!this.isModified('password')) {
            return next();
        }
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
    try {
        console.log('Comparing passwords:', {
            candidate: candidatePassword,
            hashedLength: this.password.length
        });
        const isMatch = await bcrypt.compare(candidatePassword, this.password);
        console.log('Password match result:', isMatch);
        return isMatch;
    } catch (error) {
        console.error('Password comparison error:', error);
        throw error;
    }
};

// Method to generate verification token
userSchema.methods.generateVerificationToken = function() {
    this.verificationToken = crypto.randomBytes(32).toString('hex');
    this.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    return this.verificationToken;
};

// Create compound indexes
userSchema.index({ createdAt: -1 });
userSchema.index({ 'social.website': 1 }, { sparse: true });
userSchema.index({ 'social.twitter': 1 }, { sparse: true });
userSchema.index({ 'social.instagram': 1 }, { sparse: true });

const User = mongoose.model('User', userSchema);

module.exports = User; 