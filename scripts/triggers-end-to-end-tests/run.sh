#!/bin/bash

function cleanup() {
  for PORT in 4000 9000 9001 9002 8085 9099 9199; do
    if command -v lsof &> /dev/null; then
      PID=$(lsof -t -sTCP:LISTEN -i:$PORT 2>/dev/null || true)
      if [ -n "$PID" ]; then
        kill -9 $PID 2>/dev/null || true
      fi
    elif command -v netstat &> /dev/null; then
      PIDS=$(netstat -ano | awk -v port=":$PORT" '$2 ~ port"$" && $4 == "LISTENING" {print $5}' | sort -u || true)
      for P in $PIDS; do
        if [ "$P" != "0" ] && [ -n "$P" ]; then
          taskkill //pid "$P" //T //F 2>/dev/null || true
        fi
      done
    fi
  done
}
trap cleanup EXIT

source scripts/set-default-credentials.sh
./scripts/clean-install.sh

for dir in triggers v1 v2; do
  (
    cd scripts/triggers-end-to-end-tests/$dir
    npm ci --prefer-offline --no-audit
  )
done

if [ "$1" == "inspect" ]
then
  npx mocha --exit scripts/triggers-end-to-end-tests/tests.inspect.ts
else
  npx mocha --exit scripts/triggers-end-to-end-tests/tests.ts
fi