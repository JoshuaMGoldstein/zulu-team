FROM scratch

# Mount GCS Bucket Workflow
# This workflow mounts a GCS bucket or subpath to a specified mount point

ARG BUCKET_NAME
ARG MOUNT_POINT
ARG SUB_PATH
ARG READ_ONLY=true

# Run as user git, the service-account-key should not be accesisble to the main bot under exec
USER git

# Ensure mount point exists
RUN mkdir -p ${MOUNT_POINT}
chown "${NON_ROOT_UID}:${NON_ROOT_GID}" "${MOUNT_POINT}"

# Copy service account key if provided
COPY service-account-key.json /home/git/service-account-key.json

# Set environment variable for GCS authentication
ENV GOOGLE_APPLICATION_CREDENTIALS=/home/git/service-account-key.json

# Mount the specific GCS subdirectory using gcsfuse
# --only-dir: Restricts the mount to only this subdirectory
# -o ro: Read-only mount
# -o uid, -o gid: Sets the ownership of the mounted files/directories
# -o allow_other: Allows other users (like appuser) to access the mount,
#                 necessary when uid/gid are set to a specific user.
# -o foreground: Crucial for Cloud Run, keeps gcsfuse running as the main process.

NON_ROOT_UID="1000"
NON_ROOT_GID="1000"

RUN gcsfuse \
    ${READ_ONLY:+-o ro} \
    -o uid=1001 \
    -o gid=1001 \
    -o allow_other
    ${SUB_PATH:+--only-dir ${SUB_PATH}} \
    ${BUCKET_NAME} ${MOUNT_POINT}

# Wait a moment for gcsfuse to establish the mount
sleep 5

# Verify mount
RUN ls -la ${MOUNT_POINT}