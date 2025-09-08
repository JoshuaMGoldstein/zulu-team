FROM clone-project-set-branch

ARG ACCOUNT_ID
ARG PROJECT_NAME
ARG BRANCH_NAME
ARG ENVIRONMENT

USER git
WORKDIR /workspace

# Validate required arguments
RUN if [ -z "$ACCOUNT_ID" ]; then echo "No account ID provided" && exit 1; fi
RUN if [ -z "$PROJECT_NAME" ]; then echo "No project name provided" && exit 1; fi
RUN if [ -z "$BRANCH_NAME" ]; then echo "No branch name provided" && exit 1; fi
RUN if [ -z "$ENVIRONMENT" ]; then echo "No environment provided" && exit 1; fi

# Copy the cloudbuild.json blueprint and replace variables
COPY cloudbuild.json /workspace/cloudbuild.json
COPY cloudbuild-nosecrets.json /workspace/cloudbuild-nosecrets.json

# Replace variables in the cloudbuild.json file including environment-specific secret
RUN sed -i "s/\${ACCOUNT_ID}/${ACCOUNT_ID}/g" /workspace/cloudbuild.json && \
    sed -i "s/\${PROJECT_NAME}/${PROJECT_NAME}/g" /workspace/cloudbuild.json && \
    sed -i "s/\${BRANCH_NAME}/${BRANCH_NAME}/g" /workspace/cloudbuild.json && \
    sed -i "s/\${ENVIRONMENT}/${ENVIRONMENT}/g" /workspace/cloudbuild.json

# Replace variables in the cloudbuild.json file for no-secrets variant
RUN sed -i "s/\${ACCOUNT_ID}/${ACCOUNT_ID}/g" /workspace/cloudbuild-nosecrets.json && \
    sed -i "s/\${PROJECT_NAME}/${PROJECT_NAME}/g" /workspace/cloudbuild-nosecrets.json && \
    sed -i "s/\${BRANCH_NAME}/${BRANCH_NAME}/g" /workspace/cloudbuild-nosecrets.json && \
    sed -i "s/\${ENVIRONMENT}/${ENVIRONMENT}/g" /workspace/cloudbuild-nosecrets.json


# Submit the build to Google Cloud Build, checking for secrets availability
RUN if gcloud secrets describe "account${ACCOUNT_ID}-${PROJECT_NAME}-ENVFILE-${ENVIRONMENT}" --project=zulu-team; then \
        echo "Building with secrets" && \
        gcloud builds submit --config /workspace/cloudbuild.json --service-account=projects/zulu-team/serviceAccounts/gcloud-build@zulu-team.iam.gserviceaccount.com ${PROJECT_NAME}/; \
    else \
        echo "Building without secrets" && \
        gcloud builds submit --config /workspace/cloudbuild-nosecrets.json --service-account=projects/zulu-team/serviceAccounts/gcloud-build@zulu-team.iam.gserviceaccount.com ${PROJECT_NAME}/; \
    fi


