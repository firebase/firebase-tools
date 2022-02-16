#!/bin/bash
set -e

printusage() {
  echo "run.sh <version>"
  echo ""
  echo "Arguments:"
  echo "  version: 'patch', 'minor', or 'major'."
}

VERSION=$1
if [[ $VERSION == "" ]]; then
  printusage
  exit 1
elif [[ ! ($VERSION == "patch" || $VERSION == "minor" || $VERSION == "major") ]]; then
  printusage
  exit 1
fi

THIS_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

cd "$THIS_DIR"

gcloud --project fir-tools-builds \
  builds \
  submit \
  --substitutions=_VERSION=$VERSION \
  .