#!/bin/bash
set -e # Immediately exit on failure
# Globally link the CLI for the testing framework
./scripts/clean-install.sh

mocha scripts/dataconnect-test/tests.ts
rm -rf ../../clean