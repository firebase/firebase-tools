#!/bin/bash
set -e # Immediately exit on failure

# Globally link the CLI for the testing framework
./scripts/clean-install.sh

source scripts/set-default-credentials.sh

(cd scripts/webframeworks-deploy-tests/hosting;
npm i;
cd ..;
FIREBASE_CLI_EXPERIMENTS=webframeworks firebase emulators:exec "cd ../..; mocha scripts/webframeworks-deploy-tests/tests.ts" --project $FBTOOLS_TARGET_PROJECT > firebase-emulators.log || \
cat firebase-emulators.log && \
exit 1)
