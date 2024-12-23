# Use Node.js LTS version with Alpine for smaller image size
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install system dependencies and clean up in one layer
RUN apk add --no-cache \
    ffmpeg \
    curl \
    python3 \
    make \
    g++ \
    && mkdir -p /app/public/uploads/videos \
       /app/public/uploads/thumbnails \
       /app/public/uploads/avatars \
       /app/uploads/temp \
       /app/logs \
    && chmod -R 755 /app/public/uploads \
    && chmod -R 755 /app/uploads \
    && chmod -R 755 /app/logs \
    && addgroup -S appgroup && adduser -S appuser -G appgroup

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

# Copy package files
COPY --chown=appuser:appgroup package*.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Copy project files
COPY --chown=appuser:appgroup . .

# Set proper permissions
RUN chown -R appuser:appgroup /app/public/uploads \
    && chown -R appuser:appgroup /app/uploads \
    && chown -R appuser:appgroup /app/logs

# Switch to non-root user
USER appuser

# Expose port
EXPOSE $PORT

# Health check with better parameters
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:$PORT/health || exit 1

# Start the application with reduced privileges
CMD ["npm", "start"] 