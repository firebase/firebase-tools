#!/bin/bash
set -e # Immediately exit on failure

# Globally link the CLI for the testing framework
./scripts/npm-link.sh

ts-node ./scripts/frameworks-tests/test-angular.ts
ts-node ./scripts/frameworks-tests/test-custom.ts
ts-node ./scripts/frameworks-tests/test-next.ts
ts-node ./scripts/frameworks-tests/test-vite.ts
