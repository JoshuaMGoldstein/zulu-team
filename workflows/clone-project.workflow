FROM install-git-key

ARG REPO_URL
ARG PROJECT_NAME

USER git
WORKDIR /home/git

# Clone repository into workspace subdirectory
RUN git clone ${REPO_URL} /workspace/${PROJECT_NAME}