#!/bin/bash
set -euxo pipefail # bash strict mode
IFS=$'\n\t'

# Globally link the CLI for the testing framework
./scripts/npm-link.sh

for dir in ./scripts/functions-discover-tests/fixtures/*; do
  (cd $dir && ./install.sh)
done

mocha scripts/functions-discover-tests/tests.ts