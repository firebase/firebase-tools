#!/usr/bin/env bash
set -e
CWD="$(pwd)"

source scripts/set-default-credentials.sh

RUN_SUFFIX="${GITHUB_RUN_NUMBER:-$RANDOM}-${RUNNER_OS:-linux}-${RANDOM}"
TARGET_FILE="${COMMIT_SHA}-${RUN_SUFFIX}.txt"

echo "Running in ${CWD}"
echo "Running with node: $(which node)"
echo "Running with npm: $(which npm)"
echo "Running with Application Creds: ${GOOGLE_APPLICATION_CREDENTIALS}"

echo "Target project: ${FBTOOLS_TARGET_PROJECT}"

echo "Initializing some variables..."
DATE="$(date)"
echo "Variables initalized..."

echo "Creating temp directory..."
TEMP_DIR="$(mktemp -d)"
echo "Created temp directory: ${TEMP_DIR}"

echo "Installing firebase-tools..."
./scripts/clean-install.sh
echo "Installed firebase-tools: $(which firebase)"

echo "Initializing temp directory..."
cd "${TEMP_DIR}"
PORT=8685
cat > "firebase.json" <<- EOM
{
  "emulators": {
    "hosting": {
      "port": "${PORT}"
    }
  },
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
echo "Initialized temp directory."

function kill_port() {
  local PORT_NUM="$1"
  if command -v lsof &> /dev/null; then
    local pids=$(lsof -t -sTCP:LISTEN -i:"$PORT_NUM" 2>/dev/null || true)
    if [ -n "$pids" ]; then
      kill -9 $pids 2>/dev/null || true
    fi
  fi
  if command -v netstat &> /dev/null; then
    local pids=$(netstat -ano | awk -v port=":$PORT_NUM" '$2 ~ port"$" && $4 == "LISTENING" {print $5}' | sort -u || true)
    for p in $pids; do
      if [ "$p" != "0" ] && [ -n "$p" ]; then
        taskkill //pid "$p" //T //F 2>/dev/null || true
      fi
    done
  fi
}

echo "Testing local serve..."
firebase serve --only hosting --project "${FBTOOLS_TARGET_PROJECT}" --port "${PORT}" --debug &
PID="$!"
sleep 5
VALUE="$(curl localhost:${PORT}/${TARGET_FILE})"
test "${DATE}" = "${VALUE}" || (echo "Expected ${VALUE} to equal ${DATE}." && false)
kill "$PID" 2>/dev/null || true
if command -v taskkill &> /dev/null; then
  taskkill //pid "$PID" //T //F 2>/dev/null || true
fi
kill_port "${PORT}"
echo "Tested local serve."

echo "Testing local hosting emulator..."
firebase emulators:start --only hosting --project "${FBTOOLS_TARGET_PROJECT}" &
PID="$!"
sleep 5
VALUE="$(curl localhost:${PORT}/${TARGET_FILE})"
test "${DATE}" = "${VALUE}" || (echo "Expected ${VALUE} to equal ${DATE}." && false)

# Test that ?useEmulator has the expected effect on init.js
INIT_JS_NONE="$(curl localhost:${PORT}/__/firebase/init.js)"
[[ "${INIT_JS_NONE}" =~ "firebaseEmulators = undefined" ]] || (echo "Expected firebaseEmulators to be undefined" && false)
INIT_JS_FALSE="$(curl localhost:${PORT}/__/firebase/init.js\?useEmulator=false)"
[[ "${INIT_JS_FALSE}" =~ "firebaseEmulators = undefined" ]] || (echo "Expected firebaseEmulators to be undefined" && false)
INIT_JS_TRUE="$(curl localhost:${PORT}/__/firebase/init.js\?useEmulator=true)"
[[ "${INIT_JS_TRUE}" =~ "firebaseEmulators = {" ]] || (echo "Expected firebaseEmulators to be defined" && false)

kill "$PID" 2>/dev/null || true
if command -v taskkill &> /dev/null; then
  taskkill //pid "$PID" //T //F 2>/dev/null || true
fi
kill_port "${PORT}"
kill_port "5000"
echo "Tested local hosting emulator."

echo "Testing hosting deployment..."
firebase hosting:channel:deploy --non-interactive --expires 1h --project "${FBTOOLS_TARGET_PROJECT}" --json "channel-${RUN_SUFFIX}" | tee channeldeploy.json
URL=$(cat channeldeploy.json | jq -r ".result.\"${FBTOOLS_TARGET_PROJECT}\".url")
sleep 12
VALUE="$(curl $URL/${TARGET_FILE})"
test "${DATE}" = "${VALUE}" || (echo "Expected ${VALUE} to equal ${DATE}." && false)

# Test that ?useEmulator has no effect on init.js
INIT_JS_NONE="$(curl $URL/__/firebase/init.js)"
INIT_JS_TRUE="$(curl $URL/__/firebase/init.js\?useEmulator=true)"
test "${INIT_JS_NONE}" = "${INIT_JS_TRUE}" || (echo "Expected ${INIT_JS_NONE} to equal ${INIT_JS_TRUE}." && false)

echo "Tested hosting deployment."

# Test more complex scenarios:
echo "Creating second temp directory..."
TEMP_DIR="$(mktemp -d)"
echo "Created second temp directory: ${TEMP_DIR}"

echo "Initializing a new date..."
DATE="$(date)"
echo "Initialized a new date."

echo "Initializing second temp directory..."
cd "${TEMP_DIR}"
cat > "firebase.json" <<- EOM
{
  "hosting": [
    {
      "target": "customtarget",
      "public": "public",
      "ignore": [
        "firebase.json",
        "**/.*",
        "**/node_modules/**"
      ]
    }
  ]
}
EOM
mkdir "public"
touch "public/${TARGET_FILE}"
echo "${DATE}" > "public/${TARGET_FILE}"
echo "Setting targets..."
firebase target:apply hosting customtarget "${FBTOOLS_TARGET_PROJECT}" --project "${FBTOOLS_TARGET_PROJECT}"
echo "Set targets."
echo "Initialized second temp directory."

# Skipping this in favor of the test below.
# echo "Testing hosting deployment by target..."
# firebase deploy --only hosting:customtarget --project "${FBTOOLS_TARGET_PROJECT}"
# VALUE="$(curl https://${FBTOOLS_TARGET_PROJECT}.web.app/${TARGET_FILE})"
# sleep 12
# test "${DATE}" = "${VALUE}" || (echo "Expected ${VALUE} to equal ${DATE}." && false)
# echo "Tested hosting deployment by target."

echo "Testing hosting channel deployment by target..."
firebase hosting:channel:deploy "targetchannel-${RUN_SUFFIX}" --only customtarget --project "${FBTOOLS_TARGET_PROJECT}" --non-interactive --json | tee output.json
CHANNEL_URL=$(cat output.json | jq -r ".result.customtarget.url")
sleep 12
VALUE="$(curl ${CHANNEL_URL}/${TARGET_FILE})"
test "${DATE}" = "${VALUE}" || (echo "Expected ${VALUE} to equal ${DATE}." && false)
echo "Tested hosting channel deployment by target."
