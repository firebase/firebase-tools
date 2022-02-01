#!/usr/bin/env bash
set -e
CWD="$(pwd)"

source scripts/set-default-credentials.sh

TARGET_FILE="${COMMIT_SHA}-${CI_JOB_ID}.txt"

echo "Running in ${CWD}"
echo "Running with node: $(which node)"
echo "Running with npm: $(which npm)"
echo "Running with Application Creds: ${GOOGLE_APPLICATION_CREDENTIALS}"

echo "Target project: ${FBTOOLS_TARGET_PROJECT}"

echo "Initializing some variables..."
DATE="$(date)"
NUMBER="$(date '+%Y%m%d%H%M%S')"
echo "Variables initalized..."

echo "Creating temp directory..."
TEMP_DIR="$(mktemp -d)"
echo "Created temp directory: ${TEMP_DIR}"

echo "Installing firebase-tools..."
./scripts/npm-link.sh
echo "Installed firebase-tools: $(which firebase)"

echo "Initializing temp directory..."
cd "${TEMP_DIR}"
cat > "firebase.json" <<- EOM
{
  "storage": {
    "rules": "storage.rules"
  }
}
EOM
cat > "storage.rules" <<- EOM
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth!=null && $NUMBER == $NUMBER;
    }
  }
}
EOM
echo "Initialized temp directory."

echo "Testing storage deployment..."
firebase deploy --only storage --project "${FBTOOLS_TARGET_PROJECT}"
RET_CODE="$?"
test "${RET_CODE}" == "0" || (echo "Expected exit code ${RET_CODE} to equal 0." && false)
echo "Tested storage deployment."
