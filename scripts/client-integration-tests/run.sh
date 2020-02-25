#!/bin/bash

source scripts/set-default-credentials.sh

./node_modules/.bin/mocha \
  --require ts-node/register \
  --require source-map-support/register \
  --require src/test/helpers/mocha-bootstrap.js \
  scripts/client-integration-tests/tests.ts