#!/bin/bash
set -e


function cleanup() {
  echo "Cleaning up artifacts"
  rm -rf ./clean
  rm -rf ./firebase-tools-*.tgz
  echo "Artifacts deleted"
}

trap cleanup EXIT

echo "Installing clean-publish"
npm install -g clean-publish
echo "Installed clean-publish."

echo "Running clean-publish --without-publish, as we would before publishing to npm..."
npx clean-publish --without-publish --before-script ./scripts/clean-shrinkwrap.sh --temp-dir clean
echo "Packaging cleaned firebase-tools"
cd ./clean
PACKED=$(npm pack --pack-destination ../ | tail -n 1)
cd ..
echo "Packaged firebase-tools to $PACKED"
echo "Installing clean-packaged firebase-tools"
npm install -g $PACKED
echo "Installed clean-packaged firebase-tools"
