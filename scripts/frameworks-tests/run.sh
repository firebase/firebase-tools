#!/usr/bin/env bash
set -e
CWD="$(pwd)"

echo "Running in ${CWD}"
echo "Running with node: $(which node)"
echo "Running with npm: $(which npm)"
echo "Running with Application Creds: ${GOOGLE_APPLICATION_CREDENTIALS}"

echo "Target project: ${FBTOOLS_TARGET_PROJECT}"

echo "Installing firebase-tools..."
./scripts/clean-install.sh
echo "Installed firebase-tools: $(which firebase)"

echo "Enabling experiment..."
firebase experiments:enable webframeworks
echo "Enabled experiment."

echo "Vite..."
cd scripts/frameworks-tests/vite-project
npm ci

echo "Testing local emulators:start..."
firebase emulators:start --project "${FBTOOLS_TARGET_PROJECT}" &
PID="$!"
sleep 15
VALUE="$(curl localhost:8534)"
echo "${VALUE}" | grep "Vite App" || (echo "Expected response to include \"Vite App\"." && false)
kill "$PID"
wait
echo "Tested local serve."
