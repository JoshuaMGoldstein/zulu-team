FROM install-git-key

ARG REPO_URL
ARG PROJECT_NAME

USER git
WORKDIR /home/git

# Clone repository into workspace subdirectory
# Handle both HTTPS and SSH URLs using sed for reliable replacement
RUN REPO_URL_SSH=$(echo "${REPO_URL}" | sed 's|https://github.com/|git@github.com:|') && \
    git clone "${REPO_URL_SSH}" /workspace/${PROJECT_NAME}

RUN cd /workspace/${PROJECT_NAME} && git config core.sharedRepository group
RUN chmod -R 775 /workspace/${PROJECT_NAME}

