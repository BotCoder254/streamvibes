const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
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
    verificationToken: String,
    verificationTokenExpires: Date,
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    subscribers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    subscribedTo: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Method to generate verification token
userSchema.methods.generateVerificationToken = function() {
    this.verificationToken = Math.random().toString(36).substring(2, 15) + 
                            Math.random().toString(36).substring(2, 15);
    this.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    return this.verificationToken;
};

module.exports = mongoose.model('User', userSchema); 