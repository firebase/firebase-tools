#!/bin/bash
set -e

printusage() {
  echo "run.sh <version> [branch/options]"
  echo ""
  echo "Arguments:"
  echo "  version: 'patch', 'minor', 'major', 'artifactsOnly', 'firepitOnly', 'dockerOnly', or 'preview'"
  echo "  branch: required if version is 'preview'"
  echo "  --version-number <num>: optional for 'artifactsOnly', 'firepitOnly', 'dockerOnly'"
}

VERSION=$1
shift || true

BRANCH=""
VERSION_NUMBER=""

if [[ $VERSION == "preview" ]]; then
  BRANCH=$1
  shift || true
fi

while [[ $# -gt 0 ]]; do
  case $1 in
    --version-number)
      VERSION_NUMBER="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1"
      printusage
      exit 1
      ;;
  esac
done

if [[ $VERSION == "" ]]; then
  printusage
  exit 1
elif [[ $VERSION == "preview" ]]; then
  if [[ $BRANCH == "" ]]; then
    printusage
    exit 1
  fi
elif [[ ! ($VERSION == "patch" || $VERSION == "minor" || $VERSION == "major" || $VERSION == "artifactsOnly" || $VERSION == "firepitOnly" || $VERSION == "dockerOnly") ]]; then
  printusage
  exit 1
fi

SUBSTITUTIONS="_VERSION=$VERSION"
if [[ $VERSION == "preview" ]]; then
  SUBSTITUTIONS="$SUBSTITUTIONS,_BRANCH=$BRANCH"
fi
if [[ -n "$VERSION_NUMBER" ]]; then
  SUBSTITUTIONS="$SUBSTITUTIONS,_VERSION_NUMBER=$VERSION_NUMBER"
fi

THIS_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

cd "$THIS_DIR"

gcloud --project fir-tools-builds \
  builds \
  submit \
  --machine-type=e2-highcpu-32 \
  --substitutions=$SUBSTITUTIONS \
  .
