#!/bin/bash

source scripts/set-default-credentials.sh
./scripts/npm-link.sh

(
  cd scripts/extensions-emulator-tests/functions
  npm install
)

firebase --open-sesame functionsv2

mocha scripts/extensions-emulator-tests/tests.ts


