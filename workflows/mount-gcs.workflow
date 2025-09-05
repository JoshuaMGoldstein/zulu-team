FROM scratch


# Mount GCS Bucket Workflow
# This workflow mounts a GCS bucket or subpath to a specified mount point

ARG BUCKET_NAME
ARG MOUNT_POINT
ARG SUB_PATH
ARG READ_ONLY

# Run as user git, the service-account-key should not be accesisble to the main bot under exec
USER root

# Ensure mount point exists
RUN mkdir -p ${MOUNT_POINT} 

#RUN chown "${NON_ROOT_UID}:${NON_ROOT_GID}" "${MOUNT_POINT}"

# Copy service account key if provided
COPY service-account-key.json ~/service-account-key.json

# Set environment variable for GCS authentication
ENV GOOGLE_APPLICATION_CREDENTIALS /root/service-account-key.json
ARG NON_ROOT_UID=1001
ARG NON_ROOT_GID=2000
ENV NON_ROOT_UID ${NON_ROOT_UID}
ENV NON_ROOT_GID ${NON_ROOT_GID}


# Mount the specific GCS subdirectory using gcsfuse
# --only-dir: Restricts the mount to only this subdirectory
# -o ro: Read-only mount
# -o uid, -o gid: Sets the ownership of the mounted files/directories
# -o allow_other: Allows other users (like appuser) to access the mount,
#                 necessary when uid/gid are set to a specific user.
# -o foreground: Crucial for Cloud Run, keeps gcsfuse running as the main process.


RUN gcsfuse --implicit-dirs -o allow_other${READ_ONLY:+,ro} --uid=${NON_ROOT_UID} --gid=${NON_ROOT_GID} ${SUB_PATH:+--only-dir ${SUB_PATH}} ${BUCKET_NAME} ${MOUNT_POINT}

# Verify mount
RUN ls -la ${MOUNT_POINT}