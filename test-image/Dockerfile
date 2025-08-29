FROM alpine:latest

# Install necessary packages
RUN apk add --no-cache \
    bash \
    curl \
    wget \
    git \
    openssh \
    python3 \
    nodejs \
    npm

# Set working directory
WORKDIR /workspace

# Create a test user
RUN adduser -D -s /bin/bash testuser

# Expose port for WebSocket (if needed)
EXPOSE 8088

# Default command
CMD ["tail", "-f", "/dev/null"]