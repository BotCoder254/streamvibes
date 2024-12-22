const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const Playlist = require('../models/Playlist');
const Video = require('../models/Video');

// Get all playlists for the current user
router.get('/', isAuthenticated, async (req, res) => {
    try {
        const playlists = await Playlist.find({ user: req.user._id })
            .populate({
                path: 'videos',
                select: 'title thumbnailPath duration views uploader createdAt',
                populate: {
                    path: 'uploader',
                    select: 'username avatar'
                }
            })
            .sort('-updatedAt');

        res.render('playlists/index', {
            user: req.user,
            playlists,
            title: 'My Playlists'
        });
    } catch (error) {
        console.error('Playlists error:', error);
        req.flash('error_msg', 'Error loading playlists');
        res.redirect('/dashboard');
    }
});

// Create new playlist
router.post('/', isAuthenticated, async (req, res) => {
    try {
        const { name, description, visibility } = req.body;

        if (!name || name.trim().length === 0) {
            return res.status(400).json({ error: 'Playlist name is required' });
        }

        const newPlaylist = new Playlist({
            name: name.trim(),
            description: description ? description.trim() : '',
            visibility: visibility || 'private',
            user: req.user._id
        });

        await newPlaylist.save();

        res.json({
            message: 'Playlist created successfully',
            playlist: newPlaylist
        });
    } catch (error) {
        console.error('Playlist creation error:', error);
        res.status(500).json({ error: 'Error creating playlist' });
    }
});

// Get single playlist
router.get('/:id', async (req, res) => {
    try {
        const playlist = await Playlist.findById(req.params.id)
            .populate('user', 'username avatar')
            .populate({
                path: 'videos',
                select: 'title thumbnailPath duration views uploader createdAt',
                populate: {
                    path: 'uploader',
                    select: 'username avatar'
                }
            });
        
        if (!playlist) {
            req.flash('error_msg', 'Playlist not found');
            return res.redirect('/playlists');
        }

        // Check if private playlist
        if (playlist.visibility === 'private' && 
            (!req.user || playlist.user._id.toString() !== req.user._id.toString())) {
            req.flash('error_msg', 'You do not have permission to view this playlist');
            return res.redirect('/playlists');
        }

        res.render('playlists/view', {
            user: req.user,
            playlist,
            title: playlist.name
        });
    } catch (error) {
        console.error('Playlist view error:', error);
        req.flash('error_msg', 'Error loading playlist');
        res.redirect('/playlists');
    }
});

// Update playlist
router.put('/:id', isAuthenticated, async (req, res) => {
    try {
        const playlist = await Playlist.findOne({
            _id: req.params.id,
            user: req.user._id
        });

        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found or unauthorized' });
        }

        const { name, description, visibility } = req.body;

        if (name) playlist.name = name.trim();
        if (description !== undefined) playlist.description = description.trim();
        if (visibility) playlist.visibility = visibility;

        await playlist.save();

        res.json({
            message: 'Playlist updated successfully',
            playlist
        });
    } catch (error) {
        console.error('Playlist update error:', error);
        res.status(500).json({ error: 'Error updating playlist' });
    }
});

// Delete playlist
router.delete('/:id', isAuthenticated, async (req, res) => {
    try {
        const playlist = await Playlist.findOne({
            _id: req.params.id,
            user: req.user._id
        });

        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found or unauthorized' });
        }

        await playlist.remove();

        res.json({
            message: 'Playlist deleted successfully',
            playlistId: playlist._id
        });
    } catch (error) {
        console.error('Playlist deletion error:', error);
        res.status(500).json({ error: 'Error deleting playlist' });
    }
});

// Add video to playlist
router.post('/:id/videos/:videoId', isAuthenticated, async (req, res) => {
    try {
        const playlist = await Playlist.findOne({
            _id: req.params.id,
            user: req.user._id
        });
        
        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found or unauthorized' });
        }

        const video = await Video.findById(req.params.videoId);
        if (!video) {
            return res.status(404).json({ error: 'Video not found' });
        }

        if (playlist.videos.includes(video._id)) {
            return res.status(400).json({ error: 'Video already in playlist' });
        }

        playlist.videos.push(video._id);
        await playlist.save();

        // Populate the added video for response
        await playlist.populate({
            path: 'videos',
            select: 'title thumbnailPath duration views uploader createdAt',
            populate: {
                path: 'uploader',
                select: 'username avatar'
            }
        });

        const addedVideo = playlist.videos[playlist.videos.length - 1];

        res.json({
            message: 'Video added to playlist successfully',
            video: addedVideo
        });
    } catch (error) {
        console.error('Add to playlist error:', error);
        res.status(500).json({ error: 'Error adding video to playlist' });
    }
});

// Remove video from playlist
router.delete('/:id/videos/:videoId', isAuthenticated, async (req, res) => {
    try {
        const playlist = await Playlist.findOne({
            _id: req.params.id,
            user: req.user._id
        });
        
        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found or unauthorized' });
        }

        const videoIndex = playlist.videos.indexOf(req.params.videoId);
        if (videoIndex === -1) {
            return res.status(404).json({ error: 'Video not found in playlist' });
        }

        playlist.videos.splice(videoIndex, 1);
        await playlist.save();

        res.json({
            message: 'Video removed from playlist successfully',
            videoId: req.params.videoId
        });
    } catch (error) {
        console.error('Remove from playlist error:', error);
        res.status(500).json({ error: 'Error removing video from playlist' });
    }
});

// Reorder videos in playlist
router.put('/:id/reorder', isAuthenticated, async (req, res) => {
    try {
        const playlist = await Playlist.findOne({
            _id: req.params.id,
            user: req.user._id
        });
        
        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found or unauthorized' });
        }

        const { videoIds } = req.body;
        if (!Array.isArray(videoIds)) {
            return res.status(400).json({ error: 'Invalid video order data' });
        }

        // Verify all videos exist in the playlist
        const validVideoIds = videoIds.every(id => playlist.videos.includes(id));
        if (!validVideoIds) {
            return res.status(400).json({ error: 'Invalid video IDs in order data' });
        }

        playlist.videos = videoIds;
        await playlist.save();

        res.json({
            message: 'Playlist order updated successfully',
            playlist
        });
    } catch (error) {
        console.error('Playlist reorder error:', error);
        res.status(500).json({ error: 'Error reordering playlist' });
    }
});

module.exports = router; 