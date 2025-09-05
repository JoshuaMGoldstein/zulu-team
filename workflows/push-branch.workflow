FROM scratch

ARG BRANCH_NAME
ARG PROJECT_NAME
ARG COMMIT_HASH

USER git
WORKDIR /workspace/${PROJECT_NAME}

RUN if [ -z "$BRANCH_NAME" ]; then \
      echo "No commit hash provided" && exit 1; \
    fi

RUN if [ -z "$PROJECT_NAME" ]; then \
      echo "No project name provided" && exit 1; \
    fi

RUN if [ -z "$COMMIT_HASH" ]; then \
      echo "No commit hash provided" && exit 1; \
    fi


RUN CURRENT_BRANCH="$(git branch --show-current)" && \
  CURRENT_HASH="$(git rev-parse HEAD)" && \
  CURRENT_SHORT_HASH="${CURRENT_HASH:0:7}" && \
  EXPECTED_SHORT_HASH="${COMMIT_HASH:0:7}" && \
  if [ "${EXPECTED_SHORT_HASH}" != "${CURRENT_SHORT_HASH}" ]; then \
      echo "Not on commit hash: ${EXPECTED_SHORT_HASH} - current commit is ${CURRENT_SHORT_HASH}" && exit 1; \
    fi && \
    if [[ "${BRANCH_NAME}" != "${CURRENT_BRANCH}" ]]; then \
      echo "Not on branch: ${BRANCH_NAME} - current branch is ${CURRENT_BRANCH}" && exit 1; \
    fi

# Push the branch with upstream tracking
RUN cd /workspace/${PROJECT_NAME} && \
      git push -u origin ${BRANCH_NAME};