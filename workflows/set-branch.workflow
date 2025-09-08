FROM scratch

ARG PROJECT_NAME
ARG BRANCH_NAME

USER git
WORKDIR /workspace/${PROJECT_NAME}

RUN if [ -z "$BRANCH_NAME" ]; then \
      echo "No branch name provided" && exit 1; \
    fi

RUN if [ -z "$PROJECT_NAME" ]; then \
      echo "No project name provided" && exit 1; \
    fi

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