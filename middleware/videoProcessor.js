const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const path = require('path');
const fs = require('fs').promises;

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

const processVideo = async (videoPath, outputDir, videoId) => {
    try {
        // Create output directory if it doesn't exist
        await fs.mkdir(outputDir, { recursive: true });

        // Generate thumbnail
        const thumbnailPath = path.join(outputDir, `${videoId}-thumbnail.jpg`);
        await new Promise((resolve, reject) => {
            ffmpeg(videoPath)
                .screenshots({
                    timestamps: ['50%'],
                    filename: `${videoId}-thumbnail.jpg`,
                    folder: outputDir,
                    size: '640x360'
                })
                .on('end', resolve)
                .on('error', reject);
        });

        // Get video duration
        const metadata = await new Promise((resolve, reject) => {
            ffmpeg.ffprobe(videoPath, (err, metadata) => {
                if (err) reject(err);
                else resolve(metadata);
            });
        });

        const duration = metadata.format.duration;

        // Process video for streaming
        const outputPath = path.join(outputDir, `${videoId}.mp4`);
        await new Promise((resolve, reject) => {
            ffmpeg(videoPath)
                .outputOptions([
                    '-c:v libx264',
                    '-crf 22',
                    '-c:a aac',
                    '-movflags +faststart'
                ])
                .output(outputPath)
                .on('end', resolve)
                .on('error', reject)
                .run();
        });

        return {
            duration,
            thumbnailPath: path.join('/uploads/videos', `${videoId}-thumbnail.jpg`),
            processedVideoPath: path.join('/uploads/videos', `${videoId}.mp4`)
        };
    } catch (error) {
        console.error('Video processing error:', error);
        throw error;
    }
};

module.exports = { processVideo }; 