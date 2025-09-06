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

# Reset to origin without fetching - this is safe for continued work on the same branch by the same developer, as two developers should not work on the same branch
RUN git reset --hard HEAD && \
 git clean -fd && \
 git checkout ${BRANCH_NAME} && \
 git reset --hard origin/${BRANCH_NAME}
 
# Clean up any untracked files and directories
RUN git clean -fdx