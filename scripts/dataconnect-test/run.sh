#!/bin/bash
set -e # Immediately exit on failure
# Globally link the CLI for the testing framework
./scripts/clean-install.sh
source scripts/set-default-credentials.sh

echo "Running in ${CWD}"
echo "Running with node: $(which node)"
echo "Running with npm: $(which npm)"
echo "Running with Application Creds: ${GOOGLE_APPLICATION_CREDENTIALS}"

mocha scripts/dataconnect-test/tests.ts
rm -rf ../../clean