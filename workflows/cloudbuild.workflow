FROM clone-project

ARG ACCOUNT_ID
ARG PROJECT_NAME
ARG BRANCH_NAME

USER git
WORKDIR /workspace/${PROJECT_NAME}

# Copy the cloudbuild.json blueprint and replace variables
COPY cloudbuild.json cloudbuild.json

# Replace variables in the cloudbuild.json file
RUN sed -i "s/\${ACCOUNT_ID}/${ACCOUNT_ID}/g" cloudbuild.json && \
    sed -i "s/\${PROJECT_NAME}/${PROJECT_NAME}/g" cloudbuild.json && \
    sed -i "s/\${BRANCH_NAME}/${BRANCH_NAME}/g" cloudbuild.json 

# Submit the build to Google Cloud Build
RUN gcloud builds submit --config cloudbuild.json --service-account=gcloud-build@zulu-team.iam.gserviceaccount.com