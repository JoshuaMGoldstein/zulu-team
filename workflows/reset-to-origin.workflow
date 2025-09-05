USER git


git rev-parse origin/main


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

RUN git reset --hard origin/${BRANCH_NAME} && chmod -R 775 /workspace/${PROJECT_NAME}