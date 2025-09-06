FROM clone-project

ARG ACCOUNT_ID
ARG PROJECT_NAME
ARG BRANCH_NAME
ARG ENVIRONMENT

USER git
WORKDIR /workspace/${PROJECT_NAME}

# Validate required arguments
RUN if [ -z "$ACCOUNT_ID" ]; then echo "No account ID provided" && exit 1; fi
RUN if [ -z "$PROJECT_NAME" ]; then echo "No project name provided" && exit 1; fi
RUN if [ -z "$BRANCH_NAME" ]; then echo "No branch name provided" && exit 1; fi
RUN if [ -z "$ENVIRONMENT" ]; then echo "No environment provided" && exit 1; fi

# Copy the cloudbuild.json blueprint and replace variables
COPY cloudbuild.json cloudbuild.json

RUN cat cloudbuild.json

# Replace variables in the cloudbuild.json file including environment-specific secret
RUN sed -i "s/\${ACCOUNT_ID}/${ACCOUNT_ID}/g" cloudbuild.json && \
    sed -i "s/\${PROJECT_NAME}/${PROJECT_NAME}/g" cloudbuild.json && \
    sed -i "s/\${BRANCH_NAME}/${BRANCH_NAME}/g" cloudbuild.json && \
    sed -i "s/\${ENVIRONMENT}/${ENVIRONMENT}/g" cloudbuild.json

# Submit the build to Google Cloud Build
RUN gcloud builds submit --config cloudbuild.json --service-account=projects/zulu-team/serviceAccounts/gcloud-build@zulu-team.iam.gserviceaccount.com