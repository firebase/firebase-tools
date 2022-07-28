#!/bin/bash
set -e # Immediately exit on failure

# Globally link the CLI for the testing framework
./scripts/npm-link.sh

(cd scripts/functions-deploy-test/functions && npm i)

mocha scripts/functions-deploy-tests/tests.ts
