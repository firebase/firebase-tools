#!/bin/bash

source scripts/set-default-credentials.sh
./scripts/clean-install.sh

(
  cd scripts/extensions-emulator-tests/functions
  npm install
)

mocha scripts/extensions-emulator-tests/tests.ts
