#!/bin/bash

source scripts/set-default-credentials.sh
./scripts/npm-link.sh

for dir in triggers v1 v2; do
  (
    cd scripts/triggers-end-to-end-tests/$dir
    npm install
  )
done

npx mocha --exit scripts/triggers-end-to-end-tests/tests.ts
