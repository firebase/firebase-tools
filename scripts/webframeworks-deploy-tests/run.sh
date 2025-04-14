#!/bin/bash
set -e # Immediately exit on failure

# Globally link the CLI for the testing framework
./scripts/clean-install.sh

source scripts/set-default-credentials.sh

npm ci --prefix scripts/webframeworks-deploy-tests/nextjs
npm ci --prefix scripts/webframeworks-deploy-tests/angular
npm ci --prefix scripts/webframeworks-deploy-tests/functions

FIREBASE_CLI_EXPERIMENTS=webframeworks,pintags firebase emulators:exec "mocha scripts/webframeworks-deploy-tests/tests.ts --exit --retries 2" --config scripts/webframeworks-deploy-tests/firebase.json --project demo-123 --debug
