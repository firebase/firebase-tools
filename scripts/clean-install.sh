#!/bin/bash
set -ex

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

function cleanup() {
  CLEAN_DIR="$ROOT_DIR/clean"
  echo "Cleaning up artifacts at $CLEAN_DIR..."
  rm -rf $CLEAN_DIR
  echo "Artifacts deleted."
}

trap cleanup EXIT

rm -rf $ROOT_DIR/clean || true
echo "Running clean-publish@5.0.0 --without-publish, as we would before publishing to npm..."
npx --yes clean-publish@5.0.0 --without-publish --before-script ./scripts/clean-shrinkwrap.sh --temp-dir clean
echo "Ran clean-publish@5.0.0 --without-publish."
echo "Packaging cleaned firebase-tools..."
cd $ROOT_DIR/clean
PACKED=$(npm pack --pack-destination ./ | tail -n 1)
echo "Packaged firebase-tools to $PACKED."
echo "Installing clean-packaged firebase-tools..."
npm install -g $PACKED
echo "Installed clean-packaged firebase-tools."
