FROM scratch

ARG ACCOUNT_ID
ARG PROJECT_NAME
ARG ENVIRONMENT

USER git
WORKDIR /workspace/${PROJECT_NAME}

# Validate required arguments
RUN if [ -z "$ACCOUNT_ID" ]; then echo "No account ID provided" && exit 1; fi
RUN if [ -z "$PROJECT_NAME" ]; then echo "No project name provided" && exit 1; fi
RUN if [ -z "$ENVIRONMENT" ]; then echo "No environment provided" && exit 1; fi

# Get the service URL
RUN echo "Getting service URL for ${ACCOUNT_ID}-${PROJECT_NAME}-${ENVIRONMENT}"
RUN SERVICE_URL=$(gcloud run services describe ${ACCOUNT_ID}-${PROJECT_NAME}-${ENVIRONMENT} --region=us-east4 --format='value(status.url)' --project=zulu-team)
RUN echo "$SERVICE_URL"

# Echo the service URL or mock URL
RUN if [ -z "$SERVICE_URL" ]; then 
        if [ "$ENVIRONMENT" = "dev" ] || [ "$ENVIRONMENT" = "test" ] || [ "$ENVIRONMENT" = "staging" ] || [ "$ENVIRONMENT" = "prod" ]; then 
            SERVICE_URL="https://mock-${PROJECT_NAME}-${ENVIRONMENT}-service.com"; 
            echo "$SERVICE_URL"; 
        else 
            echo "Service ${PROJECT_NAME}-${ENVIRONMENT} not found" && exit 1; 
        fi; 
    else 
        echo "$SERVICE_URL"; 
    fi