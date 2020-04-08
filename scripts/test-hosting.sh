#!/usr/bin/env bash
set -e
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
CWD="$(pwd)"

source $DIR/set-default-credentials.sh

TARGET_FILE="${COMMIT_SHA}-${CI_JOB_ID}.txt"

echo "Running in ${CWD}"
echo "Running with node: $(which node)"
echo "Running with npm: $(which npm)"
echo "Running with Application Creds: ${GOOGLE_APPLICATION_CREDENTIALS}"

echo "Target project: ${FBTOOLS_TARGET_PROJECT}"

echo "Initalizing some variables..."
DATE="$(date)"
echo "Variables initalized..."

echo "Creating temp directory..."
TEMP_DIR="$(mktemp -d)"
echo "Created temp directory: ${TEMP_DIR}"

echo "Building and packaging firebase-tools..."
npm pack
FBT_PACKAGE="$(pwd)/$(ls *.tgz)"
echo "Built and packaged firebase-tools: ${FBT_PACKAGE}"

echo "Installing firebase-tools..."
npm install --global "${FBT_PACKAGE}"
echo "Installed firebase-tools: $(which firebase)"

echo "Initalizing temp directory..."
cd "${TEMP_DIR}"
cat > "firebase.json" <<- EOM
{
  "hosting": {
    "public": "public",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ]
  }
}
EOM
mkdir "public"
touch "public/${TARGET_FILE}"
echo "${DATE}" > "public/${TARGET_FILE}"
echo "Initalized temp directory."

echo "Testing local serve..."
PORT=8685
firebase serve --only hosting --project "${FBTOOLS_TARGET_PROJECT}" --port "${PORT}" &
PID="$!"
sleep 5
VALUE="$(curl localhost:${PORT}/${TARGET_FILE})"
test "${DATE}" = "${VALUE}" || (echo "Expected ${VALUE} to equal ${DATE}." && false)
kill "$PID"
wait
echo "Tested local serve."

echo "Testing hosting deployment..."
firebase deploy --only hosting --project "${FBTOOLS_TARGET_PROJECT}"
sleep 5
VALUE="$(curl https://${FBTOOLS_TARGET_PROJECT}.web.app/${TARGET_FILE})"
test "${DATE}" = "${VALUE}" || (echo "Expected ${VALUE} to equal ${DATE}." && false)
echo "Tested hosting deployment."
