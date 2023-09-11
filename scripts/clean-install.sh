#!/bin/bash
set -e

function cleanup() {
  echo "Cleaning up artifacts..."
  rm -rf ./clean
  echo "Artifacts deleted."
}

trap cleanup EXIT

echo "Running clean-publish --without-publish, as we would before publishing to npm..."
npx clean-publish --without-publish --before-script ./scripts/clean-shrinkwrap.sh --temp-dir clean
echo "Ran clean-publish --without-publish."
echo "Packaging cleaned firebase-tools..."
cd ./clean
PACKED=$(npm pack --pack-destination ./ | tail -n 1)
echo "Packaged firebase-tools to $PACKED."
echo "Installing clean-packaged firebase-tools..."
npm install -g $PACKED
echo "Installed clean-packaged firebase-tools."
