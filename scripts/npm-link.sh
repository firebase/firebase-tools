#!/usr/bin/env bash
set -e

echo "$OSTYPE"
if [ "$CI" = "true"  &&  "$OSTYPE" != *"MSYS"*]; then
  echo "Running sudo npm link..."
  sudo npm link
else
  echo "Running npm link..."
  npm link
fi
