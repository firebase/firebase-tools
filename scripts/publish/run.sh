#!/bin/bash
set -e

printusage() {
  echo "run.sh <version> [branch]"
  echo ""
  echo "Arguments:"
  echo "  version: 'patch', 'minor', 'major', 'artifactsOnly', or 'preview'"
  echo "  branch: required if version is 'preview'"
}

VERSION=$1
BRANCH=$2
if [[ $VERSION == "" ]]; then
  printusage
  exit 1
elif [[ $VERSION == "preview" ]]; then
  if [[ $BRANCH == "" ]]; then
    printusage
    exit 1
  fi
elif [[ ! ($VERSION == "patch" || $VERSION == "minor" || $VERSION == "major" || $VERSION == "artifactsOnly") ]]; then
  printusage
  exit 1
fi

SUBSTITUTIONS="_VERSION=$VERSION"
if [[ $VERSION == "preview" ]]; then
  SUBSTITUTIONS="$SUBSTITUTIONS,_BRANCH=$BRANCH"
fi

THIS_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

cd "$THIS_DIR"

gcloud --project fir-tools-builds \
  builds \
  submit \
  --machine-type=e2-highcpu-8 \
  --substitutions=$SUBSTITUTIONS \
  .