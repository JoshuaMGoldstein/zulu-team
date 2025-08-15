# syntax=docker/dockerfile:1

FROM google/cloud-sdk:alpine

# Set environment variables to prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

#Update for node versions
RUN apk update

# Install necessary dependencies as root
RUN apk add --no-cache \
    git \
    curl \
    unzip \
    openssh-client \    
    nodejs-lts \
    npm \
    shadow \
    && rm -rf /var/cache/apk/*


# Setup Node.js 22.x LTS as root
#RUN curl -fsSL https://deb.nodesource.com/setup_22.x | sh -
#RUN apt-get install -y nodejs

# Verify Node.js and npm installation
RUN node -v
RUN npm -v

# Create a non-root user and directories for them, still as root
#RUN groupadd -r gemini-user && useradd -u 1000 -G sudo -r -g gemini-user -m -s /bin/bash gemini-user
#RUN mkdir -p /home/node/.npm-global && chown -R node:node /home/node/.npm-global && mkdir -p /workspace && chown -R node:node /workspace && chmod 777 /workspace
#VOLUME /workspace

#Run entrypoint.sh (which sets CHMOD on /workspace for gemini-user)
#COPY entrypoint.sh /usr/local/bin/entrypoint.sh
#RUN chmod +x /usr/local/bin/entrypoint.sh

# Switch to the non-root user
#USER node
WORKDIR /srv

# Configure npm for local global installs and update PATH for the gemini-user
#RUN npm config set prefix '~/.npm-global'
#ENV PATH="/home/node/.npm-global/bin:${PATH}"

# Disable git credential helper which can cause issues in non-interactive environments
# Allow connections to github.com
RUN git config --global credential.helper '' 
RUN mkdir -p -m 0700 ~/.ssh && ssh-keyscan github.com >> ~/.ssh/known_hosts && ssh-keyscan gitlab.com >> ~/.ssh/known_hosts


# Install Gemini-CLI from oruvate repo and then set ownership to gemini-user to install it. This is done as root so it can access /run/secrets
#USER root

#RUN --mount=type=secret,id=github_token \
#    git clone "https://$(cat /run/secrets/github_token)@github.com/JoshuaMGoldstein/gemini-cli.git" \
#    /home/node/gemini-cli && \
#    chown -R node:node /home/node/gemini-cli

#USER node

#RUN cd /home/node/gemini-cli && \
#    npm install && npm run build && npm install -g .


#Added for wrangler worker
RUN mkdir -p /srv/app
WORKDIR /srv/app
COPY . .
RUN npm i --omit=dev && npm run build
EXPOSE 8088
CMD ["npm", "start"]


#CMD ["sleep", "infinity"]
