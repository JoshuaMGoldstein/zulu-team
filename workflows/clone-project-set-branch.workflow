FROM install-git-key

ARG REPO_URL
ARG PROJECT_NAME
ARG BRANCH_NAME

USER git
WORKDIR /home/git

RUN if [ -z "$REPO_URL" ]; then echo "No repo url provided" && exit 1; fi
RUN if [ -z "$PROJECT_NAME" ]; then echo "No project name provided" && exit 1; fi
RUN if [ -z "$BRANCH_NAME" ]; then echo "No branch name provided" && exit 1; fi

# Clone repository into workspace subdirectory
# Handle both HTTPS and SSH URLs using sed for reliable replacement
RUN REPO_URL_SSH=$(echo "${REPO_URL}" | sed 's|https://github.com/|git@github.com:|') && \
    git clone "${REPO_URL_SSH}" /workspace/${PROJECT_NAME}

RUN cd /workspace/${PROJECT_NAME} && git config core.sharedRepository group
RUN chmod -R 775 /workspace/${PROJECT_NAME}


# Checkout specific branch if provided, creating a new local branch that tracks the remote branch
# If the branch doesn't exist remotely, create a new local branch
RUN if [ -n "${BRANCH_NAME}" ]; then \
    cd /workspace/${PROJECT_NAME} && \
    git fetch && \
    git reset --hard HEAD || true && \
    git clean -fd && \
    if git rev-parse --verify --quiet ${BRANCH_NAME}; then \
      git branch ${BRANCH_NAME} && \
      git push -u origin ${BRANCH_NAME} || true && \
      git pull && \
      git reset --hard origin/${BRANCH_NAME}; \
    elif git show-ref --verify --quiet refs/remotes/origin/${BRANCH_NAME}; then \
      git checkout -b ${BRANCH_NAME} origin/${BRANCH_NAME} && \
      git pull && \
      git reset --hard origin/${BRANCH_NAME}; \
    else \
      git checkout -b ${BRANCH_NAME} && \
      git push -u origin ${BRANCH_NAME} || true; \
    fi; \
  fi