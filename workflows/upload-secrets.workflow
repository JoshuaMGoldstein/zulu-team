FROM scratch

ARG ACCOUNT_ID
ARG PROJECT_NAME
ARG ENVIRONMENT
ARG SECRETS_CONTENT

USER git
WORKDIR /workspace

# Validate required arguments
RUN if [ -z "$ACCOUNT_ID" ]; then echo "No account ID provided" && exit 1; fi
RUN if [ -z "$PROJECT_NAME" ]; then echo "No project name provided" && exit 1; fi
RUN if [ -z "$ENVIRONMENT" ]; then echo "No environment provided" && exit 1; fi
RUN if [ -z "$SECRETS_CONTENT" ]; then echo "No secrets content provided" && exit 1; fi


# Create or update secret in Google Secret Manager
RUN SECRET_NAME="account${ACCOUNT_ID}-${PROJECT_NAME}-ENVFILE-${ENVIRONMENT}" && \
    SECRET_VALUE=$(echo "$SECRETS_CONTENT" | base64 -w 0) && \
    if gcloud secrets describe "$SECRET_NAME" --project=zulu-team >/dev/null 2>&1; then \
        echo "Updating existing secret: $SECRET_NAME" && \
        echo "$SECRET_VALUE" | gcloud secrets versions add "$SECRET_NAME" --data-file=- --project=zulu-team; \
    else \
        echo "Creating new secret: $SECRET_NAME" && \
        echo "$SECRET_VALUE" | gcloud secrets create "$SECRET_NAME" --data-file=- --project=zulu-team --replication-policy=automatic; \
    fi

# List the secret versions to confirm
RUN gcloud secrets describe "account${ACCOUNT_ID}-${PROJECT_NAME}-ENVFILE-${ENVIRONMENT}" --project=zulu-team