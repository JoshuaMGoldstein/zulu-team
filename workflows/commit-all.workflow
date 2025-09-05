FROM scratch

ARG PROJECT_NAME
ARG BRANCH_NAME
ARG COMMIT_MESSAGE

USER git
WORKDIR /workspace/${PROJECT_NAME}

RUN if [ -z "$BRANCH_NAME" ]; then \
      echo "No branch name provided" && exit 1; \
    fi

RUN if [ -z "$PROJECT_NAME" ]; then \
      echo "No project name provided" && exit 1; \
    fi

RUN if [ -z "$COMMIT_MESSAGE" ]; then \
      echo "No commt message provided" && exit 1; \
    fi

RUN CURRENT_BRANCH="$(git branch --show-current)" && \
    if [ "${BRANCH_NAME}" != "${CURRENT_BRANCH}" ]; then \
      echo "Not on branch: ${BRANCH_NAME} - current branch is ${CURRENT_BRANCH}" && exit 1; \
    fi

# Push the branch with upstream tracking
RUN git commit -am "${COMMIT_MESSAGE}"
RUN git rev-parse HEAD