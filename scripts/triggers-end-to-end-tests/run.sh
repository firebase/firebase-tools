#!/bin/bash

source scripts/set-default-credentials.sh
./scripts/npm-link.sh

echo "NODE_VERSION=$NODE_VERSION"
(
  cd scripts/triggers-end-to-end-tests/functions
  if [ "$NODE_VERSION" = "8" ]; then
    cp package{.8,}.json
  else
    cp package{.12,}.json
  fi

  npm install
)

mocha \
  --require ts-node/register \
  --require source-map-support/register \
  --require src/test/helpers/mocha-bootstrap.js \
  --exit \
  scripts/triggers-end-to-end-tests/tests.ts

rm scripts/triggers-end-to-end-tests/functions/package.json
