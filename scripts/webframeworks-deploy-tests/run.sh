#!/bin/bash
set -e # Immediately exit on failure

# Globally link the CLI for the testing framework
./scripts/clean-install.sh

source scripts/set-default-credentials.sh

(cd scripts/webframeworks-deploy-tests/hosting; npm i; npm run build)

mocha scripts/webframeworks-deploy-tests/tests.ts
