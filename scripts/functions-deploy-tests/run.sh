#!/bin/bash
set -e # Immediately exit on failure

# Globally link the CLI for the testing framework
./scripts/npm-link.sh

# Create a secret for testing
echo secret | firebase functions:secrets:set --data-file=- TOP --project $GCLOUD_PROJECT

(cd scripts/functions-deploy-tests/functions && npm i)

mocha scripts/functions-deploy-tests/tests.ts

# Prune secrets to save $$
firebase functions:secrets:destroy TOP --project $GCLOUD_PROJECT || true # ignore failures
