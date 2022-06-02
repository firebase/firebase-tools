#!/bin/bash
set -ex

# Clean the destination of the upcoming build.
rm -rf dev
# Run a special build for these tests and the source code.
tsc --build scripts/emulator-tests/tsconfig.dev.json
# Setup a cleanup process to run before exit.
function cleanup() {
  # Remove the built artifacts.
  rm -rf dev
}
trap cleanup EXIT
# Need to copy `package.json` to the directory so it can be referenced in code.
cp package.json dev/package.json

# Run the tests from the built dev directory.
mocha dev/scripts/emulator-tests/*.spec.*
