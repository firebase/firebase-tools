#!/usr/bin/env bash
set -e

if [ "$CI" = "true" ]; then
  echo "Doing normal npm link for now..."
  npm link
  # echo "Running sudo npm link..."
  # sudo npm link
else
  echo "Running npm link..."
  npm link
fi
