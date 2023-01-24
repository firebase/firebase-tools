#!/bin/bash

function cleanup() {
  if ! command -v lsof &> /dev/null
  then
      echo "lsof could not be found"
      exit
  fi
  # Kill all emulator processes
  for PORT in 4000 9000 9001 9002 8085 9099 9199
  do
    PID=$(lsof -t -i:$PORT || true)
    if [ -n "$PID" ]
    then
      kill -9 $PID
    fi
  done
}
trap cleanup EXIT

source scripts/set-default-credentials.sh
./scripts/npm-link.sh

# Prepare Node.js functions
for dir in triggers v1 v2; do
  (
    cd scripts/triggers-end-to-end-tests/$dir
    npm install
  )
done


# Prepare Python functions
(cd scripts/triggers-end-to-end-tests/python && python3 -m venv venv)
if [ "$RUNNER_OS" == "Windows" ]
then
  (cd scripts/triggers-end-to-end-tests/python && venv/Scripts/activate.bat && pip install -r requirements.txt)
else
  (cd scripts/triggers-end-to-end-tests/python && source venv/bin/activate && pip install -r requirements.txt)
fi

if [ "$1" == "inspect" ]
then
  npx mocha --exit scripts/triggers-end-to-end-tests/tests.inspect.ts
else
  npx mocha --exit scripts/triggers-end-to-end-tests/tests.ts
fi