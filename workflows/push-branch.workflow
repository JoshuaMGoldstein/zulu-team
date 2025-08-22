FROM scratch

ARG BRANCH_NAME
ARG PROJECT_NAME

USER git
WORKDIR /workspace

# Push the branch with upstream tracking
RUN if [ -n "${BRANCH_NAME}" ]; then \
    cd /workspace/${PROJECT_NAME} && \
    git push -u origin ${BRANCH_NAME}; \
  fi