#!/bin/bash

source scripts/set-default-credentials.sh
./scripts/npm-link.sh

(
  cd scripts/extensions-emulator-tests/functions
  npm install
)

<<<<<<< HEAD
npx mocha \
  --require ts-node/register \
  --require source-map-support/register \
  --require src/test/helpers/mocha-bootstrap.ts \
  --exit \
  scripts/extensions-emulator-tests/tests.ts

rm scripts/extensions-emulator-tests/functions/package.json
=======
mocha scripts/extensions-emulator-tests/tests.ts
>>>>>>> public/master
