FROM scratch

ARG ACCOUNT_ID
ARG PROJECT_NAME
ARG ENVIRONMENT
ARG IMAGE_NAME
ARG BRANCH_NAME

USER git
WORKDIR /workspace

# Validate required arguments
RUN if [ -z "$ACCOUNT_ID" ]; then echo "No account ID provided" && exit 1; fi
RUN if [ -z "$PROJECT_NAME" ]; then echo "No project name provided" && exit 1; fi
RUN if [ -z "$ENVIRONMENT" ]; then echo "No environment provided" && exit 1; fi
RUN if [ -z "$IMAGE_NAME" || -z "$BRANCH_NAME" ]; then echo "No image name or branch name provided" && exit 1; fi

# Deploy the Cloud Run service - if only branch name provided, initialize IMAGE_NAME based on it
RUN if [ -z "$IMAGE_NAME" ]; then IMAGE_NAME="${PROJECT_NAME}:${BRANCH_NAME}-latest"; fi && \
    echo "Deploying Service ${ACCOUNT_ID}-${PROJECT_NAME}-${ENVIRONMENT} with image ${IMAGE_NAME}" && \
    gcloud run deploy ${ACCOUNT_ID}-${PROJECT_NAME}-${ENVIRONMENT} \
    --image us-east4-docker.pkg.dev/zulu-team/account${ACCOUNT_ID}/${IMAGE_NAME} \
    --region us-east4 \
    --allow-unauthenticated  \
    --min-instances=0 \
    --max-instances=1 \
    --platform managed \
    --project=zulu-team

# Get the service URL after deployment
RUN gcloud run services describe ${ACCOUNT_ID}-${PROJECT_NAME}-${ENVIRONMENT} \
    --region=us-east4 \
    --format='value(status.url)' \
    --project=zulu-team