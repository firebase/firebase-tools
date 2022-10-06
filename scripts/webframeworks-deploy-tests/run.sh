#!/bin/bash
set -e # Immediately exit on failure

# Globally link the CLI for the testing framework
./scripts/npm-link.sh

(cd scripts/webframeworks-deploy-tests/hosting; npm i; npm run build)

mocha scripts/webframeworks-deploy-tests/tests.ts
