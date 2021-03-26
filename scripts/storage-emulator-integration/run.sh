#!/bin/bash
set -e # Immediately exit on failure

# Globally link the CLI for the testing framework
./scripts/npm-link.sh

# Prepare the storage emulator rules runtime
firebase setup:emulators:storage

mocha \
  --require ts-node/register \
  --require source-map-support/register \
  --require src/test/helpers/mocha-bootstrap.ts \
  scripts/storage-emulator-integration/tests.ts
