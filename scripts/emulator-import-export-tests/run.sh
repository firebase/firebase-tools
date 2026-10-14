#!/bin/bash

source scripts/set-default-credentials.sh
./scripts/clean-install.sh

npx mocha --exit scripts/emulator-import-export-tests/tests.ts