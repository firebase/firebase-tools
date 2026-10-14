#!/bin/bash
## Script for testing Docker image creation without running a full release.

# Default values
REPO_NAME="us"
TARGET_PROJECT_ID=""
BUILD_PROJECT=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --build-project|-p)
      BUILD_PROJECT="$2"
      shift 2
      ;;
    --repo|-r)
      REPO_NAME="$2"
      shift 2
      ;;
    --target|-t)
      TARGET_PROJECT_ID="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 --build-project <project> [--repo <repo>] [--target <target>]"
      exit 1
      ;;
  esac
done

if [[ -z "$BUILD_PROJECT" ]]; then
  echo "Error: --build-project is required."
  echo "Usage: $0 --build-project <project> [--repo <repo>] [--target <target>]"
  exit 1
fi

if [[ -z "$TARGET_PROJECT_ID" ]]; then
  TARGET_PROJECT_ID="$BUILD_PROJECT"
fi

npm i
cd "$( dirname "${BASH_SOURCE[0]}" )"
gcloud --project $BUILD_PROJECT \
  builds \
  submit \
  --substitutions=_REPO_NAME=$REPO_NAME,_TARGET_PROJECT_ID=$TARGET_PROJECT_ID