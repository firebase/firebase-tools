#!/usr/bin/env bash
set -e

CWD="$(pwd)"

if [ "${CI}" != "true" ]; then
  export COMMIT_SHA="localtesting"
  export CI_JOB_ID="$(echo $RANDOM)"
fi

if [[ -z $LOCAL ]]; then
  export GOOGLE_APPLICATION_CREDENTIALS="${CWD}/scripts/creds-private.json"
else
  echo "Not setting GOOGLE_APPLICATION_CREDENTIALS because LOCAL=${LOCAL}"
fi

echo "Application Default Credentials: ${GOOGLE_APPLICATION_CREDENTIALS}"