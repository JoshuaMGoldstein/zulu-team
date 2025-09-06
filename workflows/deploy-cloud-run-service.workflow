FROM scratch

ARG ACCOUNT_ID
ARG PROJECT_NAME
ARG ENVIRONMENT
ARG IMAGE_NAME

USER git
WORKDIR /workspace/${PROJECT_NAME}

# Validate required arguments
RUN if [ -z "$ACCOUNT_ID" ]; then echo "No account ID provided" && exit 1; fi
RUN if [ -z "$PROJECT_NAME" ]; then echo "No project name provided" && exit 1; fi
RUN if [ -z "$ENVIRONMENT" ]; then echo "No environment provided" && exit 1; fi
RUN if [ -z "$IMAGE_NAME" ]; then echo "No image name provided" && exit 1; fi

# Deploy the Cloud Run service
RUN echo "Deploying Cloud Run service ${ACCOUNT_ID}-${PROJECT_NAME}-${ENVIRONMENT} with image ${IMAGE_NAME}"
RUN gcloud run deploy ${ACCOUNT_ID}-${PROJECT_NAME}-${ENVIRONMENT} \
    --image us-east4-docker.pkg.dev/zulu-team/zulu-team/${IMAGE_NAME} \
    --region us-east4 \
    --allow-unauthenticated \
    --min-instances=0 \
    --max-instances=1 \
    --platform managed \
    --project=zulu-team

# Get the service URL after deployment
RUN gcloud run services describe ${ACCOUNT_ID}-${PROJECT_NAME}-${ENVIRONMENT} \
    --region=us-east4 \
    --format='value(status.url)' \
    --project=zulu-team