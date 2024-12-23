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
        required: true,
        default: '/images/default-thumbnail.jpg'
    },
    duration: {
        type: Number,
        default: 0
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
        ref: 'User',
        default: []
    }],
    dislikes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: []
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
    comments: [{
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
            ref: 'User',
            default: []
        }]
    }],
    status: {
        type: String,
        enum: ['processing', 'ready', 'failed'],
        default: 'ready'
    },
    tags: {
        type: [String],
        default: []
    }
}, {
    timestamps: true,
    toObject: { virtuals: true },
    toJSON: { virtuals: true }
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