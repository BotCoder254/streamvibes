const mongoose = require('mongoose');

// Comment reply schema
const replySchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    text: {
        type: String,
        required: true,
        trim: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    edited: {
        type: Boolean,
        default: false
    },
    editedAt: Date,
    likes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }]
});

// Comment schema
const commentSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    text: {
        type: String,
        required: true,
        trim: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    edited: {
        type: Boolean,
        default: false
    },
    editedAt: Date,
    likes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    replies: [replySchema]
});

const videoSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true,
        default: ''
    },
    fileName: {
        type: String,
        required: true
    },
    videoPath: {
        type: String,
        required: true
    },
    thumbnailPath: {
        type: String,
        required: true
    },
    duration: {
        type: Number,
        required: true
    },
    views: {
        type: Number,
        default: 0
    },
    viewsHistory: [{
        timestamp: {
            type: Date,
            default: Date.now
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    }],
    likes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    dislikes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    category: {
        type: String,
        required: true,
        enum: ['Entertainment', 'Education', 'Sports', 'Technology', 'Music', 'Gaming', 'News', 'Other']
    },
    uploader: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    comments: [commentSchema],
    status: {
        type: String,
        enum: ['processing', 'ready', 'failed'],
        default: 'processing'
    },
    tags: {
        type: [String],
        default: []
    },
    watchTimeDistribution: {
        type: [Number],
        default: [0, 0, 0, 0] // 0-25%, 25-50%, 50-75%, 75-100%
    },
    totalWatchTime: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Add indexes for better query performance
videoSchema.index({ title: 'text', description: 'text' });
videoSchema.index({ category: 1 });
videoSchema.index({ uploader: 1 });
videoSchema.index({ user: 1 });
videoSchema.index({ createdAt: -1 });
videoSchema.index({ views: -1 });

// Virtual for like count
videoSchema.virtual('likeCount').get(function() {
    return this.likes.length;
});

// Virtual for dislike count
videoSchema.virtual('dislikeCount').get(function() {
    return this.dislikes.length;
});

// Virtual for comment count
videoSchema.virtual('commentCount').get(function() {
    let count = this.comments.length;
    this.comments.forEach(comment => {
        count += comment.replies ? comment.replies.length : 0;
    });
    return count;
});

// Method to check if a user has liked the video
videoSchema.methods.isLikedBy = function(userId) {
    return this.likes.includes(userId);
};

// Method to check if a user has disliked the video
videoSchema.methods.isDislikedBy = function(userId) {
    return this.dislikes.includes(userId);
};

// Method to add a view
videoSchema.methods.addView = async function(userId) {
    this.views += 1;
    if (userId) {
        this.viewsHistory.push({
            user: userId,
            timestamp: new Date()
        });
    }
    return this.save();
};

// Method to update watch time
videoSchema.methods.updateWatchTime = async function(userId, watchTimePercentage) {
    const index = Math.floor(watchTimePercentage / 25);
    if (index >= 0 && index < 4) {
        this.watchTimeDistribution[index] += 1;
    }
    this.totalWatchTime += watchTimePercentage;
    return this.save();
};

const Video = mongoose.model('Video', videoSchema);

module.exports = Video; 