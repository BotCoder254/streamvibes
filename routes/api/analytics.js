const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../../config/auth');
const Video = require('../../models/Video');
const User = require('../../models/User');

// Helper function to get date range
function getDateRange(days) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    return { start, end };
}

// Get analytics data
router.get('/', ensureAuthenticated, async (req, res) => {
    try {
        const range = parseInt(req.query.range) || 30;
        const { start, end } = getDateRange(range);
        const previousStart = new Date(start);
        previousStart.setDate(previousStart.getDate() - range);

        // Get user's videos
        const videos = await Video.find({
            user: req.user.id,
            createdAt: { $lte: end }
        }).populate('dailyViews');

        // Calculate current period metrics
        const currentPeriodViews = videos.reduce((total, video) => {
            const periodViews = video.dailyViews.filter(view => 
                view.date >= start && view.date <= end
            ).length;
            return total + periodViews;
        }, 0);

        const currentPeriodWatchTime = videos.reduce((total, video) => {
            const periodWatchTime = video.dailyViews
                .filter(view => view.date >= start && view.date <= end)
                .reduce((sum, view) => sum + (view.watchDuration || 0), 0);
            return total + periodWatchTime;
        }, 0);

        // Calculate previous period metrics
        const previousPeriodViews = videos.reduce((total, video) => {
            const periodViews = video.dailyViews.filter(view => 
                view.date >= previousStart && view.date < start
            ).length;
            return total + periodViews;
        }, 0);

        const previousPeriodWatchTime = videos.reduce((total, video) => {
            const periodWatchTime = video.dailyViews
                .filter(view => view.date >= previousStart && view.date < start)
                .reduce((sum, view) => sum + (view.watchDuration || 0), 0);
            return total + periodWatchTime;
        }, 0);

        // Calculate growth percentages
        const viewsGrowth = previousPeriodViews === 0 ? 100 :
            ((currentPeriodViews - previousPeriodViews) / previousPeriodViews) * 100;
        
        const watchTimeGrowth = previousPeriodWatchTime === 0 ? 100 :
            ((currentPeriodWatchTime - previousPeriodWatchTime) / previousPeriodWatchTime) * 100;

        // Get engagement metrics
        const totalEngagements = videos.reduce((total, video) => {
            const likes = video.likes.length;
            const comments = video.comments.length;
            const shares = 0; // Implement share tracking if needed
            return total + likes + comments + shares;
        }, 0);

        const totalViews = videos.reduce((total, video) => total + video.views, 0);
        const engagementRate = totalViews === 0 ? 0 : (totalEngagements / totalViews) * 100;

        // Get views over time data
        const viewsData = {
            labels: [],
            values: []
        };

        for (let i = 0; i < range; i++) {
            const date = new Date(end);
            date.setDate(date.getDate() - i);
            const dateStr = date.toLocaleDateString();
            
            const dayViews = videos.reduce((total, video) => {
                const views = video.dailyViews.filter(view => 
                    new Date(view.date).toLocaleDateString() === dateStr
                ).length;
                return total + views;
            }, 0);

            viewsData.labels.unshift(dateStr);
            viewsData.values.unshift(dayViews);
        }

        // Get watch time distribution
        const watchTimeData = {
            labels: ['0-25%', '25-50%', '50-75%', '75-100%'],
            values: [0, 0, 0, 0]
        };

        videos.forEach(video => {
            video.dailyViews.forEach(view => {
                if (view.watchDuration) {
                    const percentage = (view.watchDuration / video.duration) * 100;
                    const index = Math.floor(percentage / 25);
                    if (index >= 0 && index < 4) {
                        watchTimeData.values[index]++;
                    }
                }
            });
        });

        // Get demographics data (mock data - implement actual tracking)
        const demographicsData = {
            labels: ['18-24', '25-34', '35-44', '45-54', '55+'],
            values: [30, 25, 20, 15, 10]
        };

        // Get traffic sources (mock data - implement actual tracking)
        const trafficData = {
            labels: ['Direct', 'Search', 'Social', 'External'],
            values: [40, 30, 20, 10]
        };

        // Get top performing videos
        const topVideos = await Video.find({ user: req.user.id })
            .sort('-views')
            .limit(5)
            .select('title thumbnail duration views likes comments createdAt');

        res.json({
            totalViews: currentPeriodViews,
            viewsGrowth,
            watchTime: currentPeriodWatchTime,
            watchTimeGrowth,
            engagementRate,
            subscribers: req.user.subscribers?.length || 0,
            viewsData,
            watchTimeData,
            demographicsData,
            trafficData,
            topVideos
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Export analytics data
router.get('/export', ensureAuthenticated, async (req, res) => {
    try {
        const range = parseInt(req.query.range) || 30;
        const { start, end } = getDateRange(range);

        // Get user's videos
        const videos = await Video.find({
            user: req.user.id,
            createdAt: { $lte: end }
        }).populate('dailyViews');

        // Format data for export
        const exportData = videos.map(video => ({
            title: video.title,
            views: video.views,
            likes: video.likes.length,
            comments: video.comments.length,
            watchTime: video.dailyViews.reduce((total, view) => total + (view.watchDuration || 0), 0),
            createdAt: video.createdAt
        }));

        // Set headers for CSV download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=analytics-${new Date().toISOString()}.csv`);

        // Write CSV header
        res.write('Title,Views,Likes,Comments,Watch Time (seconds),Created At\n');

        // Write data rows
        exportData.forEach(row => {
            res.write(`"${row.title}",${row.views},${row.likes},${row.comments},${row.watchTime},"${row.createdAt}"\n`);
        });

        res.end();
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router; 