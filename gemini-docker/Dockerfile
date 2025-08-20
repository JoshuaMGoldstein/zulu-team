# syntax=docker/dockerfile:1

#FROM node:22-alpine
FROM ubuntu:22.04


# Set environment variables to prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_VERSION=22.5.0

# Install necessary dependencies as root
#RUN apk add --no-cache git curl unzip tar openssh bash && rm -rf /var/cache/apk/*
RUN apt-get update && apt-get install -y curl git unzip openssh-client && apt-get clean && rm -rf /var/lib/apt/lists/*


# Setup Node.js 22.x LTS as root
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs

# Verify Node.js and npm installation
RUN node -v
RUN npm -v

# Create workspace group and users
#RUN addgroup --g 2000 workspace && \
#    addgroup -g 1001 exec && \
#    adduser -D -s /bin/ash -u 1001 -G workspace exec && \
#    addgroup -g 1002 git && \
#    adduser -D -s /bin/ash -u 1002 -G workspace git && \
#    mkdir -p /workspace && \
#    chown root:workspace /workspace && \
#    chmod -R g+rwx /workspace

VOLUME /workspace

#Create workspace group and users - ubuntu
RUN groupadd --gid 2000 workspace && \
    groupadd --gid 1001 exec && \
    useradd --create-home --shell /bin/bash --uid 1001 --gid 1001 --groups workspace exec && \
    groupadd --gid 1002 git && \
    useradd --create-home --shell /bin/bash --uid 1002 --gid 1002 --groups workspace git && \
    mkdir -p /workspace && \
    chown root:workspace /workspace && \
    chmod g+srwx /workspace
#g+srwx



# Configure git for git user
USER git
WORKDIR /home/git
RUN git config --global user.name "Zulu Team - GIT" && \
    git config --global user.email "zulu-team-git@bioniclogic.com" && \
    git config --global credential.helper '' && \
    git config --global --add safe.directory '*'

# Install Gemini-CLI for exec user
USER root
RUN --mount=type=secret,id=github_token \
    git clone "https://$(cat /run/secrets/github_token)@github.com/JoshuaMGoldstein/gemini-cli.git" \
    /home/exec/gemini-cli && \
    chown -R exec:exec /home/exec/gemini-cli

# Configure npm for exec user
USER exec
WORKDIR /home/exec
RUN git config --global user.name "Zulu Team" && \
    git config --global user.email "zulu-team@bioniclogic.com" && \
    git config --global credential.helper '' && \
    git config --global --add safe.directory '*' && \
    npm config set prefix '~/.npm-global' && \
    echo 'export PATH="/home/exec/.npm-global/bin:$PATH"' >> ~/.bashrc && \
    cd /home/exec/gemini-cli && \
    npm install && npm run build && npm install -g .

ENV PATH="/home/exec/.npm-global/bin:$PATH"

# Create SSH directories for both users and setup known hosts
# Configure PATH for the root user so it can pass this environment into the spawn() command when it runs the node websocket app
USER root
RUN mkdir -p /home/exec/.ssh /home/git/.ssh && \
    chown exec:exec /home/exec/.ssh && chmod 700 /home/exec/.ssh && \
    chown git:git /home/git/.ssh && chmod 700 /home/git/.ssh && \
    echo 'export PATH="/home/exec/.npm-global/bin:$PATH"' >> /root/.profile

ENV PATH="/home/exec/.npm-global/bin:$PATH"

# Setup SSH known hosts for git user
USER git
RUN ssh-keyscan github.com >> ~/.ssh/known_hosts && \
    ssh-keyscan gitlab.com >> ~/.ssh/known_hosts

# Create app directory for node server (runs as root)
USER root
RUN mkdir -p /home/node/app
WORKDIR /home/node/app
COPY . .
RUN npm i --omit=dev && npm run build

# Mount and set the EXEC_TOKEN from Google Cloud Secret Manager (root only)
RUN --mount=type=secret,id=exec_token \
    echo "EXEC_TOKEN=$(cat /run/secrets/exec_token)" > /home/node/app/.env && \
    chmod 600 /home/node/app/.env

# Ensure node server runs as root for user switching capabilities
USER root
EXPOSE 8088
CMD ["npm", "start"]


#CMD ["sleep", "infinity"]
