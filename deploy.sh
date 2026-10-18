#!/usr/bin/env bash
# One-command deploy to Cloud Run. Run it in Google Cloud Shell (shell.cloud.google.com) with: bash deploy.sh
# from the repo folder
# Needs a file named .env.deploy (see env.example).
set -euo pipefail

if [ ! -f .env.deploy ]; then echo "Missing .env.deploy. Copy env.example to .env.deploy and fill it in."; exit 1; fi
set -a; source .env.deploy; set +a
: "${GEMINI_API_KEY:?GEMINI_API_KEY is empty in .env.deploy}"
: "${FIREBASE_API_KEY:?FIREBASE_API_KEY is empty in .env.deploy}"
: "${FIREBASE_AUTH_DOMAIN:?FIREBASE_AUTH_DOMAIN is empty in .env.deploy}"
: "${FIREBASE_PROJECT_ID:?FIREBASE_PROJECT_ID is empty in .env.deploy}"
: "${FIREBASE_APP_ID:?FIREBASE_APP_ID is empty in .env.deploy}"
REGION="${GCP_REGION:-asia-south1}"
PROJECT="$FIREBASE_PROJECT_ID"
SERVICE="kavach"

echo "==> Project: $PROJECT   Region: $REGION"
gcloud config set project "$PROJECT" >/dev/null

echo "==> Enabling APIs (first time takes ~1 minute)"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com firebase.googleapis.com identitytoolkit.googleapis.com

echo "==> Making sure the Firestore database exists"
if ! gcloud firestore databases describe --database="(default)" >/dev/null 2>&1; then
  gcloud firestore databases create --database="(default)" --location="$REGION" --type=firestore-native
else
  echo "    already exists"
fi

echo "==> Granting build + runtime permissions to the default service account"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
for ROLE in roles/cloudbuild.builds.builder roles/artifactregistry.writer roles/logging.logWriter roles/datastore.user; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:${SA}" --role="$ROLE" --condition=None >/dev/null || true
done

echo "==> Writing env file for Cloud Run"
ENVFILE="$(mktemp)"
{
  echo "GEMINI_API_KEY: \"$GEMINI_API_KEY\""
  echo "FIREBASE_API_KEY: \"$FIREBASE_API_KEY\""
  echo "FIREBASE_AUTH_DOMAIN: \"$FIREBASE_AUTH_DOMAIN\""
  echo "FIREBASE_PROJECT_ID: \"$FIREBASE_PROJECT_ID\""
  echo "FIREBASE_APP_ID: \"$FIREBASE_APP_ID\""
  [ -n "${GEMINI_MODEL:-}" ] && echo "GEMINI_MODEL: \"$GEMINI_MODEL\""
} > "$ENVFILE"

echo "==> Building and deploying to Cloud Run (2-4 minutes)"
gcloud run deploy "$SERVICE" --source . --region "$REGION" --allow-unauthenticated \
  --env-vars-file "$ENVFILE" --memory 512Mi --cpu 1 --cpu-boost --max-instances 3 --timeout 120
rm -f "$ENVFILE"

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
echo
echo "==> Deployed: $URL"
echo "==> Deep health check (calls Gemini + Firestore for real):"
sleep 3
curl -s "$URL/api/health?deep=1" | python3 -m json.tool || true
echo
echo "NEXT:"
echo "  0. Firebase console > Authentication > Sign-in method: enable Google AND Anonymous (if not done)."
echo "  1. Firebase console > Authentication > Settings > Authorized domains > Add: ${URL#https://}"
echo "  2. Run: bash deploy-firebase.sh   (publishes Firestore rules so the live dashboard can read)"
echo "  3. Open $URL and run through the demo."
