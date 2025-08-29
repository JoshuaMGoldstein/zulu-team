FROM clone-project

ARG ACCOUNT_ID
ARG PROJECT_NAME
ARG BRANCH_NAME

USER git
WORKDIR /workspace

# Copy the cloudbuild.json blueprint and replace variables
COPY blueprints/cloudbuild.json cloudbuild.json

# Replace variables in the cloudbuild.json file
RUN sed -i "s/\${ACCOUNTID}/${ACCOUNT_ID}/g" cloudbuild.json
RUN sed -i "s/\${PROJECTID}/${PROJECT_NAME}/g" cloudbuild.json
RUN sed -i "s/\${BRANCH}/${BRANCH_NAME}/g" cloudbuild.json

# Submit the build to Google Cloud Build
RUN gcloud builds submit --config cloudbuild.json --service-account=gcloud-build@zulu-team.iam.gserviceaccount.com