const express = require('express');
const router = express.Router();
const Video = require('../models/Video');
const { ensureAuthenticated } = require('../middleware/auth');
const moment = require('moment');

// Helper function to format watch time
function formatWatchTime(minutes) {
    if (!minutes) return '0m';
    if (minutes < 60) return `${Math.round(minutes)}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = Math.round(minutes % 60);
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

// Helper function to format duration
function formatDuration(seconds) {
    if (!seconds) return '0:00';
    const duration = moment.duration(seconds, 'seconds');
    const hours = Math.floor(duration.asHours());
    const minutes = duration.minutes();
    const secs = duration.seconds();
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

router.get('/', ensureAuthenticated, async (req, res) => {
    try {
        // Get date range for analytics
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);

        // Get user's videos
        const videos = await Video.find({ user: req.user._id })
            .sort({ views: -1 })
            .limit(10);

        // Calculate total views and watch time
        const totalViews = videos.reduce((acc, video) => acc + (video.views || 0), 0);
        const totalWatchTime = videos.reduce((acc, video) => acc + (video.totalWatchTime || 0), 0);

        // Calculate engagement rate
        const totalLikes = videos.reduce((acc, video) => acc + (video.likes ? video.likes.length : 0), 0);
        const totalComments = videos.reduce((acc, video) => acc + (video.comments ? video.comments.length : 0), 0);
        const engagementRate = totalViews > 0 ? ((totalLikes + totalComments) / totalViews) * 100 : 0;

        // Get subscriber count
        const subscribers = req.user.subscribers ? req.user.subscribers.length : 0;

        // Calculate growth percentages (comparing with previous period)
        const previousPeriodStart = new Date(startDate);
        previousPeriodStart.setDate(previousPeriodStart.getDate() - 30);
        
        const previousPeriodVideos = await Video.find({
            user: req.user._id,
            createdAt: { $gte: previousPeriodStart, $lt: startDate }
        });

        const previousViews = previousPeriodVideos.reduce((acc, video) => acc + (video.views || 0), 0);
        const previousWatchTime = previousPeriodVideos.reduce((acc, video) => acc + (video.totalWatchTime || 0), 0);
        const previousLikes = previousPeriodVideos.reduce((acc, video) => acc + (video.likes ? video.likes.length : 0), 0);
        const previousComments = previousPeriodVideos.reduce((acc, video) => acc + (video.comments ? video.comments.length : 0), 0);
        
        const viewsGrowth = previousViews > 0 ? ((totalViews - previousViews) / previousViews) * 100 : 100;
        const watchTimeGrowth = previousWatchTime > 0 ? ((totalWatchTime - previousWatchTime) / previousWatchTime) * 100 : 100;
        const engagementGrowth = previousViews > 0 ? 
            (((totalLikes + totalComments) / totalViews) - ((previousLikes + previousComments) / previousViews)) * 100 : 100;
        const subscriberGrowth = 10; // This would need subscriber history data to calculate accurately

        // Prepare views data (last 30 days)
        const viewsData = {
            labels: [],
            values: []
        };

        for (let i = 0; i < 30; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const dayStart = new Date(date.setHours(0, 0, 0, 0));
            const dayEnd = new Date(date.setHours(23, 59, 59, 999));
            
            const dayViews = videos.reduce((acc, video) => {
                const viewsOnDay = video.viewsHistory?.filter(v => 
                    v.timestamp >= dayStart && v.timestamp <= dayEnd
                ).length || 0;
                return acc + viewsOnDay;
            }, 0);

            viewsData.labels.unshift(dateStr);
            viewsData.values.unshift(dayViews);
        }

        // Prepare watch time data (real watch time distribution)
        const watchTimeData = {
            labels: ['0-25%', '25-50%', '50-75%', '75-100%'],
            values: [0, 0, 0, 0]
        };

        videos.forEach(video => {
            if (video.watchTimeDistribution) {
                watchTimeData.values[0] += video.watchTimeDistribution[0] || 0;
                watchTimeData.values[1] += video.watchTimeDistribution[1] || 0;
                watchTimeData.values[2] += video.watchTimeDistribution[2] || 0;
                watchTimeData.values[3] += video.watchTimeDistribution[3] || 0;
            }
        });

        // Format video data for display
        const topVideos = videos.map(video => ({
            title: video.title,
            thumbnail: video.thumbnail,
            duration: video.duration,
            views: video.views || 0,
            likes: video.likes ? video.likes.length : 0,
            engagement: video.views ? ((video.likes ? video.likes.length : 0) / video.views) * 100 : 0,
            viewsGrowth: ((video.views || 0) - (video.previousViews || 0)) / (video.previousViews || 1) * 100,
            watchTime: video.totalWatchTime || 0
        }));

        res.render('dashboard', {
            user: req.user,
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
            topVideos,
            formatDuration,
            formatWatchTime,
            path: '/dashboard'
        });
    } catch (error) {
        console.error('Dashboard Error:', error);
        req.flash('error_msg', 'Error loading dashboard');
        res.redirect('/');
    }
});

module.exports = router; 