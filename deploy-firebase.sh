#!/usr/bin/env bash
# Deploys Firestore security rules (REQUIRED for the live dashboard) and Firebase Hosting (optional, gives PROJECT.web.app).
# Run in Cloud Shell after deploy.sh.   Usage: bash deploy-firebase.sh
set -euo pipefail
set -a; source .env.deploy; set +a
REGION="${GCP_REGION:-asia-south1}"
sed -i "s/\"region\": \"[a-z0-9-]*\"/\"region\": \"$REGION\"/" firebase.json
echo "==> Log in to Firebase (open the link, paste the code)"
npx --yes firebase-tools@latest login --no-localhost || true
echo "==> Deploying Firestore rules"
npx --yes firebase-tools@latest deploy --only firestore:rules --project "$FIREBASE_PROJECT_ID"
echo "==> Deploying Hosting (optional; if this step fails the Cloud Run URL still works)"
npx --yes firebase-tools@latest deploy --only hosting --project "$FIREBASE_PROJECT_ID" || echo "Hosting deploy failed. Skip it and submit the Cloud Run URL."
