#!/bin/bash

PROJECT_ID="zulu-team-accounts"
BUCKET_NAME="zulu-accounts-default-storage"
SERVICE_ACCOUNT_NAME="default"
KEY_FILE="${SERVICE_ACCOUNT_NAME}-key.json"

echo "--- Creating GCS Bucket: $BUCKET_NAME in project: $PROJECT_ID ---"
gsutil mb -p "$PROJECT_ID" "gs://$BUCKET_NAME"

echo "--- Creating IAM Service Account: $SERVICE_ACCOUNT_NAME ---"
gcloud iam service-accounts create "$SERVICE_ACCOUNT_NAME" \
  --display-name "AccountID: $SERVICE_ACCOUNT_NAME" \
  --project "$PROJECT_ID"

SERVICE_ACCOUNT_EMAIL=$(gcloud iam service-accounts list \
  --filter="name:$SERVICE_ACCOUNT_NAME" \
  --format="value(email)" \
  --project "$PROJECT_ID")

if [ -z "$SERVICE_ACCOUNT_EMAIL" ]; then
  echo "Error: Could not retrieve service account email for $SERVICE_ACCOUNT_NAME."
  exit 1
fi

echo "--- Granting Storage Object Admin role to $SERVICE_ACCOUNT_EMAIL on gs://$BUCKET_NAME ---"
gsutil iam ch "serviceAccount:$SERVICE_ACCOUNT_EMAIL:roles/storage.objectAdmin" "gs://$BUCKET_NAME"

echo "--- Granting Storage Legacy Bucket Reader role to $SERVICE_ACCOUNT_EMAIL on gs://$BUCKET_NAME ---"
gsutil iam ch "serviceAccount:$SERVICE_ACCOUNT_EMAIL:roles/storage.legacyBucketReader" "gs://$BUCKET_NAME"

echo "--- Granting Storage Object Viewer role to $SERVICE_ACCOUNT_EMAIL on gs://$BUCKET_NAME ---"
gsutil iam ch "serviceAccount:$SERVICE_ACCOUNT_EMAIL:roles/storage.objectViewer" "gs://$BUCKET_NAME"

echo "--- Creating and downloading JSON key for $SERVICE_ACCOUNT_EMAIL ---"
gcloud iam service-accounts keys create "$KEY_FILE" \
  --iam-account "$SERVICE_ACCOUNT_EMAIL" \
  --project "$PROJECT_ID"

echo "--- GCS resources setup complete. Key file: $KEY_FILE ---"
echo "Remember to keep '$KEY_FILE' secure and set GOOGLE_APPLICATION_CREDENTIALS before mounting."

