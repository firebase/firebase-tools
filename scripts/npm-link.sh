#!/usr/bin/env bash
set -e

echo "Running npm link..."
npm link

chmod u+x ./lib/bin/firebase.js
