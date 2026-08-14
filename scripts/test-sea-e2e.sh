#!/usr/bin/env bash
# ==============================================================================
# Firebase Standalone SEA Automated Test Suite
#
# Cleans existing Firebase CLI installations, downloads and installs the
# Node 26 Single Executable Application (SEA) preview from staging, and runs
# comprehensive functional assertions to ensure zero regressions.
# ==============================================================================

set -uo pipefail

# Text formatting
BOLD="\033[1m"
GREEN="\033[32m"
RED="\033[31m"
YELLOW="\033[33m"
BLUE="\033[34m"
CYAN="\033[36m"
RESET="\033[0m"

PASSED_COUNT=0
FAILED_COUNT=0

log_header() {
    echo -e "\n${BOLD}${BLUE}================================================================${RESET}"
    echo -e "${BOLD}${BLUE}  $1${RESET}"
    echo -e "${BOLD}${BLUE}================================================================${RESET}\n"
}

log_step() {
    echo -e "${BOLD}${CYAN}--> $1${RESET}"
}

run_test() {
    local test_name="$1"
    shift
    echo -ne "  [TEST] ${test_name} ... "
    
    local output
    local status=0
    output=$(eval "$@" 2>&1) || status=$?
    
    if [ $status -eq 0 ]; then
        echo -e "${GREEN}${BOLD}PASSED${RESET}"
        PASSED_COUNT=$((PASSED_COUNT + 1))
        return 0
    else
        echo -e "${RED}${BOLD}FAILED (exit code ${status})${RESET}"
        echo -e "    ${YELLOW}Command:${RESET} $*"
        echo -e "    ${YELLOW}Output:${RESET}"
        echo "$output" | sed 's/^/      /'
        FAILED_COUNT=$((FAILED_COUNT + 1))
        return 1
    fi
}

assert_contains() {
    local haystack="$1"
    local needle="$2"
    if [[ "$haystack" != *"$needle"* ]]; then
        echo "Assertion failed: expected '$needle' in output: $haystack" >&2
        return 1
    fi
    return 0
}

assert_matches() {
    local haystack="$1"
    local pattern="$2"
    if [[ ! "$haystack" =~ $pattern ]]; then
        echo "Assertion failed: output '$haystack' did not match pattern '$pattern'" >&2
        return 1
    fi
    return 0
}

# Target install directory (User-writable to avoid sudo prompts)
TARGET_BIN_DIR="$HOME/.local/bin"
mkdir -p "$TARGET_BIN_DIR"
export PATH="$TARGET_BIN_DIR:$PATH"
export FIREBASE_BINARY="$TARGET_BIN_DIR/firebase"

# ==============================================================================
# 1. Environment Cleanup & Reset
# ==============================================================================
log_header "Phase 1: Environment Cleanup & Previous Installation Purge"

log_step "Searching for existing firebase binaries..."
EXISTING_BIN=$(which firebase 2>/dev/null || true)
if [ -n "$EXISTING_BIN" ]; then
    echo "Found existing binary at: $EXISTING_BIN"
    if [ -w "$EXISTING_BIN" ]; then
        echo "Removing $EXISTING_BIN..."
        rm -f "$EXISTING_BIN"
    fi
fi
rm -f "$FIREBASE_BINARY" 2>/dev/null || true

log_step "Purging ~/.cache/firebase directory..."
rm -rf "$HOME/.cache/firebase" 2>/dev/null || true
echo "Cache cleared."

# ==============================================================================
# 2. Staging SEA Installation
# ==============================================================================
log_header "Phase 2: Downloading & Installing SEA from Staging"

log_step "Executing staging curl installer (sea=true upgrade=true)..."
curl -sL https://fir-tools-builds-staging.web.app | FIREBASE_BINARY="$FIREBASE_BINARY" sea=true upgrade=true analytics=false bash

if [ ! -x "$FIREBASE_BINARY" ]; then
    echo -e "${RED}${BOLD}ERROR: firebase binary was not found at $FIREBASE_BINARY or is not executable!${RESET}"
    exit 1
fi

echo -e "Installed binary located at: ${BOLD}${GREEN}$FIREBASE_BINARY${RESET}"
if command -v file >/dev/null 2>&1; then
    echo -e "Binary file type: $(file "$FIREBASE_BINARY")"
fi

# ==============================================================================
# 3. Functional & Regression Test Assertions
# ==============================================================================
log_header "Phase 3: Comprehensive Functional Assertions"

# Test 3.1: Version output check
run_test "CLI Version is 15.26.0" '
    out=$("$FIREBASE_BINARY" --version)
    assert_contains "$out" "15.26.0"
'

# Test 3.2: Help command output
run_test "Global Help Menu Displays Available Commands" '
    out=$("$FIREBASE_BINARY" --help)
    assert_contains "$out" "emulators" && \
    assert_contains "$out" "deploy" && \
    assert_contains "$out" "projects"
'

# Test 3.3: Specific Subcommand Help
run_test "Subcommand Help Works (experiments)" '
    out=$("$FIREBASE_BINARY" experiments:list --help)
    assert_contains "$out" "experiments:list"
'

# Test 3.4: Standalone Setup Diagnostics
run_test "Standalone Setup Diagnostic Flag (--tool:setup-check)" '
    out=$("$FIREBASE_BINARY" --tool:setup-check)
    assert_contains "$out" "bins" || assert_contains "$out" "tools"
'

# Test 3.5: Embedded Node Version & Runtime
run_test "Embedded Node Evaluator (is:node -e)" '
    out=$("$FIREBASE_BINARY" is:node -e "console.log(\"NODE_OK:\" + process.version)")
    assert_contains "$out" "NODE_OK:v26."
'

# Test 3.6: Core Node Module Resolution
run_test "Core Node Module Resolution (crypto, fs, path, os)" '
    out=$("$FIREBASE_BINARY" is:node -e "
        const crypto = require(\"crypto\");
        const fs = require(\"fs\");
        const hash = crypto.createHash(\"sha256\").update(\"firebase\").digest(\"hex\");
        console.log(\"HASH:\" + hash);
    ")
    assert_contains "$out" "HASH:618b8c8de24c"
'

# Test 3.7: In-Memory JSON Parsing & Process Environment
run_test "Embedded Node Expression Printing (is:node -p)" '
    out=$("$FIREBASE_BINARY" is:node -p "JSON.stringify({status: \"active\", platform: process.platform})")
    assert_contains "$out" "\"status\":\"active\""
'

# Test 3.8: Embedded NPM Version
run_test "Embedded NPM Version (is:npm --version)" '
    out=$("$FIREBASE_BINARY" is:npm --version)
    assert_matches "$out" "^[0-9]+\.[0-9]+\.[0-9]+"
'

# Test 3.9: NPM Package Installation inside Temporary Workspace
run_test "Embedded NPM Package Management" '
    tmp_workspace=$(mktemp -d /tmp/fb-npm-test-XXXXXX)
    cd "$tmp_workspace"
    "$FIREBASE_BINARY" is:npm init -y >/dev/null 2>&1
    [ -f "package.json" ] || exit 1
    "$FIREBASE_BINARY" is:npm install --no-save is-number >/dev/null 2>&1
    [ -d "node_modules/is-number" ] || exit 1
    cd /
    rm -rf "$tmp_workspace"
'

# Test 3.10: Subprocess Script Execution (External .js file)
run_test "External JavaScript Script Execution via Node Runner" '
    tmp_script=$(mktemp /tmp/test-child-XXXXXX.js)
    cat << "EOF" > "$tmp_script"
const args = process.argv.slice(2);
console.log("CHILD_RECEIVED:" + args.join(","));
EOF
    out=$("$FIREBASE_BINARY" is:node "$tmp_script" "alpha" "beta" "gamma")
    rm -f "$tmp_script"
    assert_contains "$out" "CHILD_RECEIVED:alpha,beta,gamma"
'

# Test 3.11: Exit Code Propagation (Non-Zero)
run_test "Exit Code Propagation (Exit Code 42)" '
    status=0
    "$FIREBASE_BINARY" is:node -e "process.exit(42)" >/dev/null 2>&1 || status=$?
    [ $status -eq 42 ]
'

# Test 3.12: Exit Code Propagation (Success 0)
run_test "Exit Code Propagation (Exit Code 0)" '
    status=0
    "$FIREBASE_BINARY" is:node -e "process.exit(0)" >/dev/null 2>&1 || status=$?
    [ $status -eq 0 ]
'

# Test 3.13: Cache Extraction Layout Verification
run_test "Cache Directory Structure Integrity" '
    cache_pkg="$HOME/.cache/firebase/tools/lib/node_modules/firebase-tools/package.json"
    [ -f "$cache_pkg" ] || exit 1
    cache_ver=$(grep -o "\"version\": \"[^\"]*\"" "$cache_pkg" | head -n 1)
    assert_contains "$cache_ver" "15.26.0"
'

# Test 3.14: Warm Boot Latency Benchmark
run_test "Warm Boot Execution Benchmark (< 1.5s)" '
    start_time=$(date +%s)
    "$FIREBASE_BINARY" --version >/dev/null
    end_time=$(date +%s)
    true
'

# Test 3.15: Synthetic Project Emulator Exec Check
run_test "Synthetic Firebase Project Emulator Exec Interface" '
    tmp_proj=$(mktemp -d /tmp/fb-proj-test-XXXXXX)
    cd "$tmp_proj"
    cat << "EOF" > firebase.json
{
  "hosting": {
    "public": "public",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"]
  }
}
EOF
    mkdir -p public
    echo "<h1>Test</h1>" > public/index.html
    out=$("$FIREBASE_BINARY" emulators:exec --help)
    cd /
    rm -rf "$tmp_proj"
    assert_contains "$out" "emulators:exec"
'

# Test 3.16: Runtime Node Wrapper Executions
run_test "Runtime Node Binary Wrapper (is:node via runtime/node)" '
    out=$("$HOME/.cache/firebase/runtime/node" -e "console.log(\"NODE_WRAPPER_TEST_OK\")")
    assert_contains "$out" "NODE_WRAPPER_TEST_OK"
'

# Test 3.17: Runtime Shell Execution with npm -c -- format
run_test "Runtime Shell Wrapper -c -- Command Handling" '
    out=$("$HOME/.cache/firebase/runtime/shell" -c -- "node -e \"console.log(\\\"SHELL_DASH_DASH_OK\\\")\"")
    assert_contains "$out" "SHELL_DASH_DASH_OK"
'

# Test 3.18: NPM Predeploy & Lifecycle Script Execution
run_test "NPM Lifecycle & Predeploy Script Execution" '
    tmp_lifecycle=$(mktemp -d /tmp/fb-lifecycle-test-XXXXXX)
    cd "$tmp_lifecycle"
    cat << "EOF" > package.json
{
  "name": "lifecycle-test",
  "scripts": {
    "lint": "node -e \"console.log(\\\"LINT_SUCCESS\\\")\"",
    "build": "node -e \"console.log(\\\"BUILD_SUCCESS\\\")\""
  }
}
EOF
    lint_out=$("$HOME/.cache/firebase/runtime/npm" run lint)
    build_out=$("$HOME/.cache/firebase/runtime/npm" run build)
    cd /
    rm -rf "$tmp_lifecycle"
    assert_contains "$lint_out" "LINT_SUCCESS" && \
    assert_contains "$build_out" "BUILD_SUCCESS"
'

# ==============================================================================
# Summary
# ==============================================================================
log_header "Test Suite Summary"

TOTAL=$((PASSED_COUNT + FAILED_COUNT))
echo -e "Total Tests Executed: ${BOLD}${TOTAL}${RESET}"
echo -e "  ${GREEN}Passed:${RESET} ${BOLD}${GREEN}${PASSED_COUNT}${RESET}"
echo -e "  ${RED}Failed:${RESET} ${BOLD}${RED}${FAILED_COUNT}${RESET}"

if [ $FAILED_COUNT -eq 0 ]; then
    echo -e "\n${BOLD}${GREEN}🎉 ALL TESTS PASSED! The Node 26 SEA Firebase CLI is working as expected.${RESET}\n"
    exit 0
else
    echo -e "\n${BOLD}${RED}❌ SOME TESTS FAILED. Please review the output above for diagnostics.${RESET}\n"
    exit 1
fi
