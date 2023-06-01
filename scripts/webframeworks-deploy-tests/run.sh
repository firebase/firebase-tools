#!/bin/bash
set -e # Immediately exit on failure

# Globally link the CLI for the testing framework
# ./scripts/clean-install.sh

source scripts/set-default-credentials.sh

(cd scripts/webframeworks-deploy-tests/nextjs;
npm ci;
cd ../angular;
npm ci;
cd ..;
FIREBASE_CLI_EXPERIMENTS=webframeworks,pintags firebase emulators:exec "cd ../..; mocha scripts/webframeworks-deploy-tests/tests.ts" --project demo-123 --debug > firebase-emulators.log || \
(cat firebase-emulators.log && exit 1);
cat firebase-emulators.log)
