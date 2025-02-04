#!/bin/bash
set -ex # Immediately exit on failure
# Globally link the CLI for the testing framework
./scripts/clean-install.sh
source scripts/set-default-credentials.sh

echo "Running in ${CWD}"
echo "Running with node: $(which node)"
echo "Running with npm: $(which npm)"
echo "Running with Application Creds: ${GOOGLE_APPLICATION_CREDENTIALS}"

cd scripts/dataconnect-emulator-tests
firebase emulators:exec "cd ." --only dataconnect -P demo-test
# rm -rf ../../clean
