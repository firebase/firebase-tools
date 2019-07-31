#!/usr/bin/env bash
set -e

CWD="$(pwd)"

if [ "${TRAVIS}" != "true" ]; then
  export TRAVIS_COMMIT="localtesting"
  export TRAVIS_JOB_ID="$(echo $RANDOM)"
  export TRAVIS_REPO_SLUG="firebase/firebase-tools"
fi

GOOGLE_APPLICATION_CREDENTIALS="${CWD}/scripts/creds-private.json"
if [ "${TRAVIS_REPO_SLUG}" == "firebase/firebase-tools" ]; then
  GOOGLE_APPLICATION_CREDENTIALS="${CWD}/scripts/creds-public.json"
fi
export GOOGLE_APPLICATION_CREDENTIALS

echo "Application Default Credentials: ${GOOGLE_APPLICATION_CREDENTIALS}"