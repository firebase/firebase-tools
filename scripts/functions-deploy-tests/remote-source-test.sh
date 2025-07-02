#!/bin/bash

# Remote Source Integration Test
# This script tests the remote source functionality

set -e # Exit on error

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
FIREBASE_TOOLS_DIR="$SCRIPT_DIR/../.."

echo "=== Testing Remote Source Deployment ==="

# Create a temporary test project directory
TEST_DIR=$(mktemp -d)
cd "$TEST_DIR"

# Initialize a test Firebase project
cat > firebase.json << EOF
{
  "functions": [
    {
      "remoteSource": {
        "repo": "https://github.com/firebase/functions-samples",
        "ref": "main",
        "path": "Node-1st-gen/quickstarts/uppercase"
      },
      "codebase": "uppercase-test"
    }
  ]
}
EOF

# Create environment file for the remote source
cat > .env.uppercase-test << EOF
TEST_ENV_VAR=remote-source-test
EOF

# Test 1: Validate configuration
echo "Test 1: Validating configuration..."
"$FIREBASE_TOOLS_DIR/lib/bin/firebase.js" functions:config:get --project demo-test || true

# Test 2: Dry run deployment (won't actually deploy but will download and validate)
echo "Test 2: Dry run deployment..."
"$FIREBASE_TOOLS_DIR/lib/bin/firebase.js" deploy --only functions --dry-run --project demo-test --debug

# Test 3: Test invalid remote source (missing functions.yaml)
echo "Test 3: Testing invalid remote source..."
cat > firebase-invalid.json << EOF
{
  "functions": [
    {
      "remoteSource": {
        "repo": "https://github.com/firebase/firebase-tools",
        "ref": "master"
      },
      "codebase": "invalid-test"
    }
  ]
}
EOF

# This should fail
if "$FIREBASE_TOOLS_DIR/lib/bin/firebase.js" deploy --only functions --dry-run --project demo-test --config firebase-invalid.json 2>&1 | grep -q "functions.yaml"; then
  echo "✓ Correctly rejected source without functions.yaml"
else
  echo "✗ Failed to reject invalid source"
  exit 1
fi

# Test 4: Test path validation
echo "Test 4: Testing path validation..."
cat > firebase-bad-path.json << EOF
{
  "functions": [
    {
      "remoteSource": {
        "repo": "https://github.com/firebase/functions-samples",
        "ref": "main",
        "path": "../../../etc/passwd"
      },
      "codebase": "bad-path"
    }
  ]
}
EOF

# This should fail
if "$FIREBASE_TOOLS_DIR/lib/bin/firebase.js" deploy --only functions --dry-run --project demo-test --config firebase-bad-path.json 2>&1 | grep -q "cannot contain"; then
  echo "✓ Correctly rejected dangerous path"
else
  echo "✗ Failed to reject dangerous path"
  exit 1
fi

# Cleanup
cd /
rm -rf "$TEST_DIR"

echo "=== All Remote Source Tests Passed ==="