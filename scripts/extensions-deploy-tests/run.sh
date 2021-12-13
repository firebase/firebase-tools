#!/bin/bash
set -e # Immediately exit on failure

# Globally link the CLI for the testing framework
./scripts/npm-link.sh

mocha \
  --require ts-node/register \
  --require source-map-support/register \
  --require src/test/helpers/mocha-bootstrap.ts \
  scripts/extensions-deploy-tests/tests.ts
