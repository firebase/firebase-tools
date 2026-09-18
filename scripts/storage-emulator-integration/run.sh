#!/bin/bash
set -e # Immediately exit on failure

# Globally link the CLI for the testing framework
./scripts/clean-install.sh

# Set application default credentials.
source scripts/set-default-credentials.sh

# Prepare the storage emulator rules runtime
firebase setup:emulators:storage

# Poll until emulators release their ports or timeout is reached.
wait_for_emulators_shutdown() {
  local timeout=${1:-5}
  local ports=("${@:2}")
  if [ ${#ports[@]} -eq 0 ]; then
    ports=(9199 4400 4000 9099)
  fi

  for port in "${ports[@]}"; do
    local start=$(date +%s)
    while :; do
      local in_use=0
      if command -v nc >/dev/null 2>&1; then
        if nc -z 127.0.0.1 "$port" >/dev/null 2>&1; then
          in_use=1
        fi
      elif (echo > "/dev/tcp/127.0.0.1/$port") >/dev/null 2>&1; then
        in_use=1
      elif command -v node >/dev/null 2>&1; then
        if node -e "const net = require(\"net\"); const s = net.createConnection({port: $port, host: \"127.0.0.1\"}, () => { s.end(); process.exit(0); }).on(\"error\", () => process.exit(1));" >/dev/null 2>&1; then
          in_use=1
        fi
      fi

      if [ "$in_use" -eq 0 ]; then
        break
      fi

      local now=$(date +%s)
      if [ $((now - start)) -ge "$timeout" ]; then
        echo "Warning: Port $port did not release within ${timeout}s" >&2
        break
      fi
      sleep 0.1
    done
  done
}

mocha scripts/storage-emulator-integration/internal/tests.ts

wait_for_emulators_shutdown

mocha scripts/storage-emulator-integration/rules/*.test.ts

wait_for_emulators_shutdown

mocha scripts/storage-emulator-integration/import/tests.ts

wait_for_emulators_shutdown

mocha scripts/storage-emulator-integration/multiple-targets/tests.ts

wait_for_emulators_shutdown

mocha scripts/storage-emulator-integration/conformance/*.test.ts
