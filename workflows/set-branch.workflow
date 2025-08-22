FROM clone-project

ARG BRANCH_NAME

USER git
WORKDIR /workspace

# Checkout specific branch if provided, creating a new local branch that tracks the remote branch
# If the branch doesn't exist remotely, create a new local branch
RUN if [ -n "${BRANCH_NAME}" ]; then \
    cd /workspace/${PROJECT_NAME} && \
    git fetch && \
    if git show-ref --verify --quiet refs/remotes/origin/${BRANCH_NAME}; then \
      git checkout -b ${BRANCH_NAME} origin/${BRANCH_NAME} && \
      git pull; \
    else \
      git checkout -b ${BRANCH_NAME} && \
      git push -u origin ${BRANCH_NAME} || true; \
    fi; \
  fi