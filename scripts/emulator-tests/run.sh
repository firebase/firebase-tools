#!/bin/bash

rm -rf dev
tsc --build tsconfig.dev.json
cp package.json dev/package.json

mocha \
  --bail \
  --require ts-node/register \
  --require src/test/helpers/mocha-bootstrap.ts \
  dev/scripts/emulator-tests/*.spec.*