FROM scratch

ARG FILENAME
ARG PROJECT_NAME

USER git

WORKDIR /workspace/${PROJECT_NAME}

RUN touch ${FILENAME} && \
    CURRENT_VALUE=$(cat ${FILENAME}) && \
    if [ -z "$CURRENT_VALUE" ]; then CURRENT_VALUE="0"; fi && \
    NEW_VALUE=$((CURRENT_VALUE +1)) && \
    echo "${NEW_VALUE}" > ${FILENAME}
RUN git add ${FILENAME}