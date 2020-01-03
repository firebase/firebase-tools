#!/usr/bin/env bash
set -e

CWD="$(pwd)"

if [ "${TRAVIS}" != "true" ]; then
  export TRAVIS_COMMIT="localtesting"
  export TRAVIS_JOB_ID="$(echo $RANDOM)"
  export TRAVIS_REPO_SLUG="firebase/firebase-tools"
fi

if [[ -z $LOCAL ]]; then
  export GOOGLE_APPLICATION_CREDENTIALS="${CWD}/scripts/creds-private.json"
else
  echo "Not setting GOOGLE_APPLICATION_CREDENTIALS because LOCAL=${LOCAL}"
fi

echo "Application Default Credentials: ${GOOGLE_APPLICATION_CREDENTIALS}"