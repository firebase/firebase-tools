#!/bin/bash

source scripts/set-default-credentials.sh
./scripts/npm-link.sh

npx mocha --exit scripts/emulator-import-export-tests/tests.ts