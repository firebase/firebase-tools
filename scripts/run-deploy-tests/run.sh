#!/bin/bash
set -e # Immediately exit on failure

# Globally link the CLI for the testing framework
./scripts/clean-install.sh

if [ -f "scripts/set-default-credentials.sh" ]; then
  source scripts/set-default-credentials.sh
fi

echo "======================================"
echo "Starting Cloud Run E2E Test Suite"
echo "======================================"

mocha scripts/run-deploy-tests/tests.ts --timeout 600000
