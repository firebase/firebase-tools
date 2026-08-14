#!/bin/bash

source scripts/set-default-credentials.sh

mocha --timeout 30000 scripts/client-integration-tests/tests.ts