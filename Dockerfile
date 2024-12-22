# Use Node.js LTS version
FROM node:20-slim

# Set working directory
WORKDIR /app

# Install system dependencies including ffmpeg and other required packages
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    BASE_URL=http://localhost:3000 \
    MONGODB_URI="mongodb+srv://stream:telvinteum@stream.o3qip.mongodb.net/?retryWrites=true&w=majority&appName=stream" \
    SESSION_SECRET=KquWbFL6DYB7sw4FxuVXAyZnwbfArT0YpoxF1yNGKZg \
    JWT_SECRET=iYYO8jSXNZauzM7tNKcyQMZhJhwIG-_XcFDwf5OIfgk \
    SMTP_HOST=smtp.gmail.com \
    SMTP_PORT=587 \
    SMTP_USER=teumteum776@gmail.com \
    SMTP_PASS=lxnqofjkeeivvjqq

# Create necessary directories with proper permissions
RUN mkdir -p /app/public/uploads/videos \
    /app/public/uploads/thumbnails \
    /app/public/uploads/avatars \
    /app/uploads/temp \
    && chmod -R 755 /app/public/uploads \
    && chmod -R 755 /app/uploads

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy project files
COPY . .

# Set proper permissions for uploaded files
RUN chown -R node:node /app/public/uploads \
    && chown -R node:node /app/uploads

# Switch to non-root user
USER node

# Expose port
EXPOSE $PORT

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:$PORT/ || exit 1

# Start the application
CMD ["npm", "start"] 