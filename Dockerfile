# Use Node.js LTS version
FROM node:18-slim

# Set working directory
WORKDIR /app

# Install system dependencies for video processing and curl for healthcheck
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables
ENV PORT=3000 \
    NODE_ENV=production \
    BASE_URL=http://localhost:3000 \
    MONGODB_URI="mongodb+srv://stream:telvinteum@stream.o3qip.mongodb.net/?retryWrites=true&w=majority&appName=stream" \
    SESSION_SECRET=KquWbFL6DYB7sw4FxuVXAyZnwbfArT0YpoxF1yNGKZg \
    JWT_SECRET=iYYO8jSXNZauzM7tNKcyQMZhJhwIG-_XcFDwf5OIfgk \
    UPLOAD_DIR=uploads \
    MAX_FILE_SIZE=20000000 \
    SMTP_HOST=smtp.gmail.com \
    SMTP_PORT=587 \
    SMTP_USER=teumteum776@gmail.com \
    SMTP_PASS=lxnqofjkeeivvjqq \
    MAX_VIDEO_SIZE=20000000 \
    MAX_THUMBNAIL_SIZE=20000000 \
    ALLOWED_VIDEO_TYPES=video/mp4,video/webm \
    ALLOWED_IMAGE_TYPES=image/jpeg,image/png,image/gif \
    UPLOAD_PATH=/app/public/uploads \
    TEMP_PATH=/app/uploads/temp

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy project files
COPY . .

# Create upload directories
RUN mkdir -p public/uploads/videos \
    public/uploads/thumbnails \
    public/uploads/avatars \
    uploads/temp \
    && chmod -R 755 public/uploads \
    && chmod -R 755 uploads

# Expose port
EXPOSE $PORT

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:$PORT/ || exit 1

# Start the application
CMD ["npm", "start"] 