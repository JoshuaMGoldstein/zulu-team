#!/bin/bash

# This script runs as root initially to perform the gcsfuse mount.

GCS_BUCKET_ROOT="/gcs_mount_root" # This is where Cloud Run mounts the entire bucket
# TARGET_SUBDIRECTORY will be passed via environment variable
APPUSER_MOUNT_POINT="/home/appuser/gcs_data" # A generic mount point for the user
NON_ROOT_USER="appuser"
NON_ROOT_UID="1000"
NON_ROOT_GID="1000"

echo "--- Container Entrypoint: Starting GCS FUSE mount ---"

# Get the target subdirectory from an environment variable
TARGET_SUBDIRECTORY="${GCS_SUBDIR_TO_MOUNT}"
if [ -z "${TARGET_SUBDIRECTORY}" ]; then
  echo "Error: GCS_SUBDIR_TO_MOUNT environment variable is not set. Exiting."
  exit 1
fi

# Create the mount point for the specific subdirectory, owned by appuser
mkdir -p "${APPUSER_MOUNT_POINT}"
chown "${NON_ROOT_UID}:${NON_ROOT_GID}" "${APPUSER_MOUNT_POINT}"

# Mount the specific GCS subdirectory using gcsfuse
# --only-dir: Restricts the mount to only this subdirectory
# -o ro: Read-only mount
# -o uid, -o gid: Sets the ownership of the mounted files/directories
# -o allow_other: Allows other users (like appuser) to access the mount,
#                 necessary when uid/gid are set to a specific user.
# -o foreground: Crucial for Cloud Run, keeps gcsfuse running as the main process.
gcsfuse \
  --only-dir "${TARGET_SUBDIRECTORY}" \
  -o ro \
  -o uid="${NON_ROOT_UID}" \
  -o gid="${NON_ROOT_GID}" \
  -o allow_other \
  "${GCS_BUCKET_ROOT}" "${APPUSER_MOUNT_POINT}" & # Run in background for now, will exec later

# Wait a moment for gcsfuse to establish the mount
sleep 5

# Check if the mount was successful
if mountpoint -q "${APPUSER_MOUNT_POINT}"; then
  echo "GCS subdirectory '${TARGET_SUBDIRECTORY}' successfully mounted to '${APPUSER_MOUNT_POINT}' as read-only for user '${NON_ROOT_USER}'."
elif [ -z "${TARGET_SUBDIRECTORY}" ]; then
  echo "Error: GCS_SUBDIR_TO_MOUNT environment variable is not set. Exiting."
  exit 1
else
  echo "Error: GCS FUSE mount failed. Exiting."
  exit 1
fi

echo "--- Dropping privileges and executing application as ${NON_ROOT_USER} ---"

# Drop privileges and execute the main application command as the non-root user
# The "$@" expands to the CMD specified in the Dockerfile (e.g., "bash")
exec su - "${NON_ROOT_USER}" -c "exec "$@""