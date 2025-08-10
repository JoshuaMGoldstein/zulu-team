# syntax=docker/dockerfile:1

# Use Ubuntu 22.04 as the base image
FROM ubuntu:22.04

# Set environment variables to prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Install necessary dependencies as root
RUN apt-get update && apt-get install -y \
    git \
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
RUN groupadd -r gemini-user && useradd -u 1000 -G sudo -r -g gemini-user -m -s /bin/bash gemini-user
RUN mkdir -p /home/gemini-user/.npm-global && chown -R gemini-user:gemini-user /home/gemini-user/.npm-global

RUN mkdir -p /workspace && chown -R gemini-user:gemini-user /workspace
VOLUME /workspace

#Run entrypoint.sh (which sets CHMOD on /workspace for gemini-user)
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Switch to the non-root user
USER gemini-user
WORKDIR /home/gemini-user

# Configure npm for local global installs and update PATH for the gemini-user
RUN npm config set prefix '~/.npm-global'
ENV PATH="/home/gemini-user/.npm-global/bin:${PATH}"

# Disable git credential helper which can cause issues in non-interactive environments
RUN git config --global credential.helper ''

RUN mkdir -p -m 0700 ~/.ssh && ssh-keyscan github.com >> ~/.ssh/known_hosts


# Install Gemini-CLI from oruvate repo and then set ownership to gemini-user to install it. This is done as root so it can access /run/secrets
USER root

RUN --mount=type=secret,id=github_token \
    git clone "https://$(cat /run/secrets/github_token)@github.com/JoshuaMGoldstein/gemini-cli.git" \
    /home/gemini-user/gemini-cli && \
    chown -R gemini-user:gemini-user /home/gemini-user/gemini-cli

USER gemini-user

RUN cd /home/gemini-user/gemini-cli && \
    npm install && npm run build && npm install -g .




#Run entrypoint, which will chown -R gemini-user:gemini-user /workspace && sleep infinity
#ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["sleep", "infinity"]