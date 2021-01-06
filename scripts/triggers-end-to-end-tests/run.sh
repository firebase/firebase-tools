#!/bin/bash

source scripts/set-default-credentials.sh
./scripts/npm-link.sh

(
  cd scripts/triggers-end-to-end-tests/functions
  npm install
)

mocha \
  --require ts-node/register \
  --require source-map-support/register \
  --require src/test/helpers/mocha-bootstrap.ts \
  --exit \
  scripts/triggers-end-to-end-tests/tests.ts

rm scripts/triggers-end-to-end-tests/functions/package.json
