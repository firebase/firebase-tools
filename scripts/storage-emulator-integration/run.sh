#!/bin/bash
set -e # Immediately exit on failure

# Globally link the CLI for the testing framework
./scripts/npm-link.sh

# Prepare the storage emulator rules runtime
firebase setup:emulators:storage

mocha scripts/storage-emulator-integration/rules/*.test.ts

mocha scripts/storage-emulator-integration/tests.ts
