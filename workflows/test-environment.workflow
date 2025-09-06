FROM scratch

ARG ACCOUNT_ID
ARG PROJECT_NAME
ARG ENVIRONMENT
ARG TEST_COMMAND

USER git
WORKDIR /workspace/${PROJECT_NAME}

# Validate required arguments
RUN if [ -z "$ACCOUNT_ID" ]; then echo "No account ID provided" && exit 1; fi
RUN if [ -z "$PROJECT_NAME" ]; then echo "No project name provided" && exit 1; fi
RUN if [ -z "$ENVIRONMENT" ]; then echo "No environment provided" && exit 1; fi
RUN if [ -z "$TEST_COMMAND" ]; then echo "No test command provided" && exit 1; fi

# Get the service URL
RUN SERVICE_URL=$(gcloud run services describe ${ACCOUNT_ID}-${PROJECT_NAME}-${ENVIRONMENT} --region=us-east4 --format='value(status.url)' --project=zulu-team) && \
    echo "Testing service at: $SERVICE_URL"

# Run health check
RUN SERVICE_URL=$(gcloud run services describe ${ACCOUNT_ID}-${PROJECT_NAME}-${ENVIRONMENT} --region=us-east4 --format='value(status.url)' --project=zulu-team) && \
    curl -f -s -o /dev/null -w "Health check: %{http_code}
" "$SERVICE_URL/health" 2>/dev/null || echo "No health endpoint found"

# Run the provided test command
RUN SERVICE_URL=$(gcloud run services describe ${ACCOUNT_ID}-${PROJECT_NAME}-${ENVIRONMENT} --region=us-east4 --format='value(status.url)' --project=zulu-team) && \
    export SERVICE_URL && \
    export ENVIRONMENT=${ENVIRONMENT} && \
    export PROJECT_NAME=${PROJECT_NAME} && \
    eval "${TEST_COMMAND}"

# Get service status and URL
RUN SERVICE_URL=$(gcloud run services describe ${ACCOUNT_ID}-${PROJECT_NAME}-${ENVIRONMENT} --region=us-east4 --format='value(status.url)' --project=zulu-team) && \
    echo "Service URL: $SERVICE_URL"