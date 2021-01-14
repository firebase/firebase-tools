#!/bin/bash

source scripts/set-default-credentials.sh

mocha \
  --bail \
  --require ts-node/register \
  --require source-map-support/register \
  --require src/test/helpers/mocha-bootstrap.ts \
  --file src/test/helpers/global-mock-auth.ts \
  scripts/emulator-tests/*.spec.*