# Use Ubuntu 22.04 as the base image
FROM ubuntu:22.04

# Set environment variables to prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Install necessary dependencies as root
RUN apt-get update && apt-get install -y \
    curl \
    git \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Setup Node.js 22.x LTS as root
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
RUN apt-get install -y nodejs

# Verify Node.js and npm installation
RUN node -v
RUN npm -v

# Create a non-root user and directories for them, still as root
RUN groupadd -r gemini-user && useradd -r -g gemini-user -m -s /bin/bash gemini-user
RUN mkdir -p /home/gemini-user/.npm-global && chown -R gemini-user:gemini-user /home/gemini-user/.npm-global
RUN mkdir -p /workspace && chown -R gemini-user:gemini-user /workspace

# Switch to the non-root user
USER gemini-user
WORKDIR /home/gemini-user

# Configure npm for local global installs and update PATH for the gemini-user
RUN npm config set prefix '~/.npm-global'
ENV PATH="/home/gemini-user/.npm-global/bin:${PATH}"

# Disable git credential helper which can cause issues in non-interactive environments
RUN git config --global credential.helper ''

# Install Gemini-CLI from source to correctly handle build dependencies (like esbuild)
# and then install the hooks package. This is all done as the gemini-user.
RUN git clone https://github.com/JoshuaMGoldstein/gemini-cli-hooks /home/gemini-user/gemini-cli && \
    cd /home/gemini-user/gemini-cli && \
    npm install && \
    npm run build && \
    npm install -g .

# Keep the container running indefinitely
CMD ["sleep", "infinity"]
