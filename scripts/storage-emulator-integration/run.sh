#!/bin/bash
set -e # Immediately exit on failure

# Globally link the CLI for the testing framework
./scripts/clean-install.sh

# Set application default credentials.
source scripts/set-default-credentials.sh

# Prepare the storage emulator rules runtime
firebase setup:emulators:storage

# Determine port check method once globally.
if command -v nc >/dev/null 2>&1; then
  is_port_in_use() {
    nc -z 127.0.0.1 "$1" >/dev/null 2>&1
  }
elif (: > "/dev/tcp/127.0.0.1/1") 2>/dev/null || true; then
  is_port_in_use() {
    (: > "/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1
  }
elif command -v node >/dev/null 2>&1; then
  is_port_in_use() {
    node -e "const net = require(\"net\"); const s = net.createConnection({port: $1, host: \"127.0.0.1\"}, () => { s.end(); process.exit(0); }).on(\"error\", () => process.exit(1));" >/dev/null 2>&1
  }
fi

# Poll until emulators release their ports or overall timeout is reached.
wait_for_emulators_shutdown() {
  local timeout=${1:-5}
  local ports=("${@:2}")
  if [ ${#ports[@]} -eq 0 ]; then
    ports=(9199 4400 4000 9099)
  fi

  local end=$((SECONDS + timeout))
  for port in "${ports[@]}"; do
    while is_port_in_use "$port"; do
      if [ "$SECONDS" -ge "$end" ]; then
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
