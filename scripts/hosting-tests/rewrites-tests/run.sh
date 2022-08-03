#!/bin/bash

source scripts/set-default-credentials.sh

mocha scripts/hosting-tests/rewrites-tests/tests.ts
