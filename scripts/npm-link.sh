#!/usr/bin/env bash
set -e

if [ "$CI" = "true" ]; then
  echo "Running sudo npm link..."
  sudo npm link
else
  echo "Running npm link..."
  npm link
fi
