FROM scratch

ARG PROJECT_NAME
ARG ENVFILE
USER git

WORKDIR /workspace/${PROJECT_NAME}

echo -e "${ENVFILE}" | base64 -d > .env"