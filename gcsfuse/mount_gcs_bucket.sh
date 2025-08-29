#!/bin/bash

BUCKET_NAME="zulu-accounts-default-storage"
MOUNT_POINT="$(pwd)/default-storage-mount"

# Check if GOOGLE_APPLICATION_CREDENTIALS is set
if [ -z "$GOOGLE_APPLICATION_CREDENTIALS" ]; then
  echo "Error: GOOGLE_APPLICATION_CREDENTIALS environment variable is not set."
  echo "Please set it to the path of your service account key file (e.g., export GOOGLE_APPLICATION_CREDENTIALS="/path/to/key.json")."
  exit 1
fi

# Create the mount point if it doesn't exist
mkdir -p "$MOUNT_POINT"

echo "--- Mounting GCS bucket '$BUCKET_NAME' to '$MOUNT_POINT' ---"
gcsfuse -o ro "$BUCKET_NAME" "$MOUNT_POINT"

echo "--- GCS bucket mounted successfully. ---"
