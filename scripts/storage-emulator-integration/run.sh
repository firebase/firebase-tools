#!/bin/bash
set -e # Immediately exit on failure

# Globally link the CLI for the testing framework
./scripts/clean-install.sh

# Set application default credentials.
source scripts/set-default-credentials.sh

# Prepare the storage emulator rules runtime
firebase setup:emulators:storage

mocha scripts/storage-emulator-integration/rules/*.test.ts

mocha scripts/storage-emulator-integration/import/tests.ts

mocha scripts/storage-emulator-integration/internal/tests.ts

mocha scripts/storage-emulator-integration/multiple-targets/tests.ts

mocha scripts/storage-emulator-integration/conformance/*.test.ts
