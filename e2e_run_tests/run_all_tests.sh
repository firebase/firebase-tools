#!/bin/bash
# E2E Test Suite for Firebase Cloud Run Integration
# Tiers 1-4

APP_DIR="/Users/aryanf/code/firebase/firebase-apphosting-canary/apps/nextjs-reference/next-15.3/"
PROJECT="aryanf-test"
CLI="node /Users/aryanf/code/firebase/firebase-tools/lib/bin/firebase.js"

echo "======================================"
echo "Starting E2E Tests for Cloud Run"
echo "======================================"

cd "$APP_DIR" || exit 1

# Backup existing configs
mv firebase.json firebase.json.bak 2>/dev/null
mv .firebaserc .firebaserc.bak 2>/dev/null

FAILED=0

run_test() {
  local name=$1
  shift
  echo "Running: $name"
  "$@"
  local status=$?
  if [ $status -ne 0 ]; then
    echo "❌ FAIL: $name (exit code: $status)"
    FAILED=$((FAILED + 1))
  else
    echo "✅ PASS: $name"
  fi
}

run_test_expect_fail() {
  local name=$1
  shift
  echo "Running (Expecting Fail): $name"
  "$@"
  local status=$?
  if [ $status -eq 0 ]; then
    echo "❌ FAIL: $name expected to fail but succeeded."
    FAILED=$((FAILED + 1))
  else
    echo "✅ PASS: $name (failed as expected with code: $status)"
  fi
}

echo ""
echo "--- Tier 1: Feature Coverage ---"
# T1.1
rm -f firebase.json .firebaserc
run_test "T1.1: Init Cloud Run non-interactive" $CLI init run --non-interactive --project "$PROJECT"

# T1.2
rm -f firebase.json .firebaserc
run_test "T1.2: Init Cloud Run with --project" $CLI init run --non-interactive --project "$PROJECT"

# T1.3
rm -f firebase.json .firebaserc
touch firebase.json # Mock existing config
run_test "T1.3: Init Cloud Run (additive)" $CLI init run --non-interactive --project "$PROJECT"

# T1.4
run_test "T1.4: Deploy to Cloud Run" $CLI deploy --only run --project "$PROJECT" --non-interactive

# T1.5
run_test "T1.5: Deploy with force" $CLI deploy --only run --project "$PROJECT" --non-interactive --force


echo ""
echo "--- Tier 2: Boundary & Corner Cases ---"
# T2.1
rm -f firebase.json .firebaserc
run_test_expect_fail "T2.1: Init Cloud Run with invalid project" $CLI init run --non-interactive --project "invalid-project-id-1234567890"

# T2.2
# Create a dir without write permissions for testing
mkdir -p no_write_dir
chmod 555 no_write_dir
cd no_write_dir || exit 1
run_test_expect_fail "T2.2: Init in directory without write permissions" $CLI init run --non-interactive --project "$PROJECT"
cd .. || exit 1
rm -rf no_write_dir

# T2.3
# Deploy with no config
rm -f firebase.json .firebaserc
run_test_expect_fail "T2.3: Deploy without firebase.json" $CLI deploy --only run --project "$PROJECT" --non-interactive

# T2.4
$CLI init run --non-interactive --project "$PROJECT"
run_test_expect_fail "T2.4: Deploy with invalid region (simulated by env)" env FIREBASE_RUN_REGION=invalid-region $CLI deploy --only run --project "$PROJECT" --non-interactive

# T2.5
run_test "T2.5: Init repeatedly (idempotent)" $CLI init run --non-interactive --project "$PROJECT"


echo ""
echo "--- Tier 3: Cross-Feature Combinations ---"
# T3.1
rm -f firebase.json .firebaserc
run_test "T3.1: Init then immediately deploy" bash -c "$CLI init run --non-interactive --project \"$PROJECT\" && $CLI deploy --only run --project \"$PROJECT\" --non-interactive"

# T3.2
run_test "T3.2: Multiple sequential deploys" bash -c "$CLI deploy --only run --project \"$PROJECT\" --non-interactive && $CLI deploy --only run --project \"$PROJECT\" --non-interactive"


echo ""
echo "--- Tier 4: Real-World Application Scenarios ---"
# T4.1
rm -f firebase.json .firebaserc apphosting.yaml
echo "T4.1: Next.js Full Lifecycle with apphosting.yaml Verification (Init -> Deploy -> Verify)"
cat <<EOF > apphosting.yaml
runConfig:
  cpu: 2
  memoryMiB: 1024
  minInstances: 1
  maxInstances: 5
  concurrency: 100
env:
  - variable: TEST_VAR
    value: "hello_world"
EOF

$CLI init run --non-interactive --project "$PROJECT"
if [ $? -eq 0 ]; then
  $CLI deploy --only run --project "$PROJECT" --non-interactive
  if [ $? -eq 0 ]; then
    echo "Verifying Cloud Run configuration..."
    SERVICE_NAME=$(cat firebase.json | grep -o '"serviceId"[[:space:]]*:[[:space:]]*"[^"]*"' | awk -F '"' '{print $4}')
    REGION=$(cat firebase.json | grep -o '"region"[[:space:]]*:[[:space:]]*"[^"]*"' | awk -F '"' '{print $4}')
    if [ -z "$REGION" ]; then REGION="us-central1"; fi

    gcloud run services describe $SERVICE_NAME --region $REGION --project "$PROJECT" --format=json > svc.json
    CPU=$(cat svc.json | jq -r '(.spec.template.spec.containers[0].resources.limits.cpu // .template.containers[0].resources.limits.cpu)')
    MEM=$(cat svc.json | jq -r '(.spec.template.spec.containers[0].resources.limits.memory // .template.containers[0].resources.limits.memory)')
    MIN=$(cat svc.json | jq -r '(.spec.template.metadata.annotations["autoscaling.knative.dev/minScale"] // .template.scaling.minInstanceCount)')
    MAX=$(cat svc.json | jq -r '(.spec.template.metadata.annotations["autoscaling.knative.dev/maxScale"] // .template.scaling.maxInstanceCount)')
    CONCURRENCY=$(cat svc.json | jq -r '((.spec.template.spec.containerConcurrency | tostring) // (.template.maxInstanceRequestConcurrency | tostring))')
    ENV_VAL=$(cat svc.json | jq -r '([.spec.template.spec.containers[0].env[]?, .template.containers[0].env[]?] | map(select(.name=="TEST_VAR")) | .[0].value)')

    if [ "$CPU" = "2" ] && [ "$MEM" = "1024Mi" ] && [ "$MIN" = "1" ] && [ "$MAX" = "5" ] && [ "$CONCURRENCY" = "100" ] && [ "$ENV_VAL" = "hello_world" ]; then
      echo "✅ PASS: T4.1 configuration verified"
    else
      echo "❌ FAIL: T4.1 configuration did not match expectations"
      echo "CPU: $CPU (expected 2)"
      echo "MEM: $MEM (expected 1024Mi)"
      echo "MIN: $MIN (expected 1)"
      echo "MAX: $MAX (expected 5)"
      echo "CONCURRENCY: $CONCURRENCY (expected 100)"
      echo "ENV_VAL: $ENV_VAL (expected hello_world)"
      FAILED=$((FAILED + 1))
    fi
  else
    echo "❌ FAIL: T4.1 Deploy failed"
    FAILED=$((FAILED + 1))
  fi
else
  echo "❌ FAIL: T4.1 Init failed"
  FAILED=$((FAILED + 1))
fi
rm -f apphosting.yaml svc.json

# Restore configs
mv firebase.json.bak firebase.json 2>/dev/null
mv .firebaserc.bak .firebaserc 2>/dev/null

echo "======================================"
if [ $FAILED -gt 0 ]; then
  echo "Tests Completed with $FAILED Failures."
  exit 1
else
  echo "All Tests Passed Successfully!"
  exit 0
fi
