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
./scripts/clean-install.sh
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
firebase deploy --force --only storage --project "${FBTOOLS_TARGET_PROJECT}"
RET_CODE="$?"
test "${RET_CODE}" == "0" || (echo "Expected exit code ${RET_CODE} to equal 0." && false)
echo "Tested storage deployment."

echo "Updating config for targets..."
cat > "firebase.json" <<- EOM
{
  "storage": [
    {
      "target": "storage-target",
      "rules": "storage.rules"
    }
  ]
}
EOM
firebase use --add "${FBTOOLS_TARGET_PROJECT}"
firebase target:apply storage storage-target "${FBTOOLS_TARGET_PROJECT}.appspot.com"
echo "Updated config for targets."

echo "Testing storage deployment with invalid target..."
set +e
firebase deploy --force --only storage:storage-invalid-target --project "${FBTOOLS_TARGET_PROJECT}"
RET_CODE="$?"
set -e
test "${RET_CODE}" == "1" || (echo "Expected exit code ${RET_CODE} to equal 1." && false)
echo "Tested storage deployment with invalid target."

echo "Testing storage deployment with target..."
firebase deploy --force --only storage:storage-target --project "${FBTOOLS_TARGET_PROJECT}"
RET_CODE="$?"
test "${RET_CODE}" == "0" || (echo "Expected exit code ${RET_CODE} to equal 0." && false)
echo "Tested storage deployment with target."