#!/bin/bash

set -xe

cd ./scripts/triggers-end-to-end-tests

firebase setup:emulators:firestore
firebase setup:emulators:database

npm install && npm test
