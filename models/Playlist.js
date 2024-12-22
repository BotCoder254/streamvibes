const mongoose = require('mongoose');

const playlistSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true,
        default: ''
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    videos: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Video'
    }],
    visibility: {
        type: String,
        enum: ['public', 'private', 'unlisted'],
        default: 'private'
    },
    thumbnailPath: {
        type: String,
        default: '/images/default-playlist.png'
    },
    totalDuration: {
        type: Number,
        default: 0
    },
    totalViews: {
        type: Number,
        default: 0
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Update thumbnail and stats when videos are modified
playlistSchema.pre('save', async function(next) {
    if (this.isModified('videos')) {
        try {
            if (this.videos.length > 0) {
                const Video = mongoose.model('Video');
                const firstVideo = await Video.findById(this.videos[0]);
                if (firstVideo && firstVideo.thumbnailPath) {
                    this.thumbnailPath = firstVideo.thumbnailPath;
                }

                // Update playlist stats
                const videos = await Video.find({ _id: { $in: this.videos } });
                this.totalDuration = videos.reduce((acc, video) => acc + (video.duration || 0), 0);
                this.totalViews = videos.reduce((acc, video) => acc + (video.views || 0), 0);
            } else {
                // Reset to defaults if no videos
                this.thumbnailPath = '/images/default-playlist.png';
                this.totalDuration = 0;
                this.totalViews = 0;
            }
            this.lastUpdated = new Date();
        } catch (error) {
            console.error('Error updating playlist stats:', error);
        }
    }
    next();
});

// Virtual for video count
playlistSchema.virtual('videoCount').get(function() {
    return this.videos.length;
});

// Method to check if a video is in the playlist
playlistSchema.methods.hasVideo = function(videoId) {
    return this.videos.includes(videoId);
};

// Method to add a video
playlistSchema.methods.addVideo = async function(videoId) {
    if (!this.videos.includes(videoId)) {
        this.videos.push(videoId);
        await this.save();
        return true;
    }
    return false;
};

// Method to remove a video
playlistSchema.methods.removeVideo = async function(videoId) {
    const index = this.videos.indexOf(videoId);
    if (index > -1) {
        this.videos.splice(index, 1);
        await this.save();
        return true;
    }
    return false;
};

// Method to reorder videos
playlistSchema.methods.reorderVideos = async function(videoIds) {
    // Verify all videos exist in the playlist
    const validVideoIds = videoIds.every(id => this.videos.includes(id));
    if (!validVideoIds) {
        throw new Error('Invalid video IDs in order data');
    }
    this.videos = videoIds;
    await this.save();
    return true;
};

// Add indexes for better query performance
playlistSchema.index({ user: 1 });
playlistSchema.index({ visibility: 1 });
playlistSchema.index({ createdAt: -1 });
playlistSchema.index({ lastUpdated: -1 });

const Playlist = mongoose.model('Playlist', playlistSchema);

module.exports = Playlist; 