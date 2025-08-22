FROM clone-project

ARG BRANCH_NAME

USER git
WORKDIR /workspace

# Checkout specific branch if provided, creating a new local branch that tracks the remote branch
# If the branch doesn't exist remotely, create a new local branch
RUN if [ -n "${BRANCH_NAME}" ]; then cd /workspace/${PROJECT_NAME} && git fetch && (git checkout -b ${BRANCH_NAME} origin/${BRANCH_NAME} 2>/dev/null && git pull || git checkout -b ${BRANCH_NAME} ); fi