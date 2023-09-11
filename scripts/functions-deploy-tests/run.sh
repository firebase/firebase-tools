#!/bin/bash
set -e # Immediately exit on failure

# Globally link the CLI for the testing framework
./scripts/clean-install.sh

# Create a secret for testing if it doesn't exist
firebase functions:secrets:get TOP --project $GCLOUD_PROJECT || (echo secret | firebase functions:secrets:set --data-file=- TOP --project $GCLOUD_PROJECT -f)

(cd scripts/functions-deploy-tests/functions && npm i)

mocha scripts/functions-deploy-tests/tests.ts