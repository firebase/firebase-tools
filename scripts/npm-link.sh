#!/usr/bin/env bash
set -e

echo "$OSTYPE"
if [ "$CI" = "true"  &&  "$OSTYPE" != *"MSYS"* ]; then ## Don't sudo on windows
  echo "Running sudo npm link..."
  sudo npm link
else
  echo "Running npm link..."
  npm link
fi
