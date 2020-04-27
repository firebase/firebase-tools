#!/bin/bash
set -e # Immediately exit on failure

# Globally link the CLI for the testing framework.
npm link

cd scripts/extensions-emulator-tests/greet-the-world
npm i
cd - # Return to root so that we don't need a relative path for mocha

mocha \
  --require ts-node/register \
  --require source-map-support/register \
  --require src/test/helpers/mocha-bootstrap.js \
  scripts/extensions-emulator-tests/tests.ts
