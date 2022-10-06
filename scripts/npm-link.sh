#!/usr/bin/env bash
set -e

echo "Running npm link..."
npm link

chmod u+rx ./lib/bin/firebase.js
