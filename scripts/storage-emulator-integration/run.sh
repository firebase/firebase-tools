#!/bin/bash
set -e # Immediately exit on failure

# Globally link the CLI for the testing framework
#./scripts/npm-link.sh

# Prepare the storage emulator rules runtime
#firebase setup:emulators:storage

#mocha scripts/storage-emulator-integration/rules/*.test.ts

#mocha scripts/storage-emulator-integration/import/tests.ts

#mocha scripts/storage-emulator-integration/internal/tests.ts

#mocha scripts/storage-emulator-integration/multiple-targets/tests.ts

#mocha scripts/storage-emulator-integration/conformance/*.test.ts
#STORAGE_EMULATOR_DEBUG=1 
#mocha scripts/storage-emulator-integration/conformance/gcs.endpoints.test.ts  --timeout 20000
#STORAGE_EMULATOR_DEBUG=1 mocha scripts/storage-emulator-integration/conformance/firebase.endpoints.test.ts  --timeout 20000
#STORAGE_EMULATOR_DEBUG=1 
mocha scripts/storage-emulator-integration/conformance/gcs-js-sdk.test.ts --timeout 10000