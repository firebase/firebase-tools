#!/bin/bash
set -ex

function cleanup() {
  echo "Cleaning up artifacts..."
  rm -rf ./clean
  echo "Artifacts deleted."
}

trap cleanup EXIT

rm -rf ./clean || true
echo "Running clean-publish@5.0.0 --without-publish, as we would before publishing to npm..."
npx --yes clean-publish@5.0.0 --without-publish --before-script ./scripts/clean-shrinkwrap.sh --temp-dir clean
echo "Ran clean-publish@5.0.0 --without-publish."
echo "Packaging cleaned firebase-tools..."
cd ./clean
PACKED=$(npm pack --pack-destination ./ | tail -n 1)
echo "Packaged firebase-tools to $PACKED."
echo "Installing clean-packaged firebase-tools..."
npm install -g $PACKED
echo "Installed clean-packaged firebase-tools."
