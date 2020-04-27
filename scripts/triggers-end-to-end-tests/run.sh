#!/bin/bash

source scripts/set-default-credentials.sh

npm link

mocha \
  --require ts-node/register \
  --require source-map-support/register \
  --require src/test/helpers/mocha-bootstrap.js \
  --exit \
  scripts/triggers-end-to-end-tests/tests.ts
