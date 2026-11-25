#!/bin/bash
set -e

printusage() {
  echo "run.sh <version> [branch] [--use-oss-gate]"
  echo ""
  echo "Arguments:"
  echo "  version: 'patch', 'minor', 'major', 'artifactsOnly', or 'preview'"
  echo "  branch: required if version is 'preview'"
  echo ""
  echo "Options:"
  echo "  --use-oss-gate: Publish npm package through OSS Exit Gate"
}

USE_OSS_GATE=false
POSITIONAL_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --use-oss-gate)
      USE_OSS_GATE=true
      shift
      ;;
    -*)
      echo "Unknown option: $1"
      printusage
      exit 1
      ;;
    *)
      POSITIONAL_ARGS+=("$1")
      shift
      ;;
  esac
done

VERSION=${POSITIONAL_ARGS[0]:-}
BRANCH=${POSITIONAL_ARGS[1]:-}
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

SUBSTITUTIONS="_VERSION=$VERSION,_USE_OSS_GATE=$USE_OSS_GATE"
if [[ $VERSION == "preview" ]]; then
  SUBSTITUTIONS="$SUBSTITUTIONS,_BRANCH=$BRANCH"
fi

THIS_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

cd "$THIS_DIR"

gcloud --project fir-tools-builds \
  builds \
  submit \
  --machine-type=e2-highcpu-32 \
  --substitutions=$SUBSTITUTIONS \
  .

if [[ $VERSION != "preview" ]]; then
  gcloud --project fir-tools-builds \
    builds \
    submit \
    --config=./firebase-docker-image/cloudbuild-promote.yaml \
    --substitutions=_TARGET_PROJECT_ID=firebase-cli \
    ./firebase-docker-image
fi
