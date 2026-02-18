# Fix: Remove restrictive port validation in App Hosting custom start commands

## Problem

The App Hosting emulator enforced overly restrictive validation that rejected any custom start command containing `--port` or `-p` flags. This validation threw a `FirebaseError` and prevented legitimate use cases where developers need explicit port control in their custom commands.

**Previous behavior:**
```typescript
if (startCommand.includes("--port") || startCommand.includes(" -p ")) {
  throw new FirebaseError(
    "Specifying a port in the start command is not supported by the apphosting emulator",
  );
}
```

This blanket rejection was problematic for:
- Framework-specific configurations requiring explicit port binding
- Custom wrapper scripts that manage port allocation
- Development workflows where port specification is part of the command chain

## Solution

This PR refactors the port handling logic to be more permissive while maintaining intelligent defaults:

### 1. Removed Restrictive Validation
Eliminated the error-throwing validation that blocked port flags entirely.

### 2. Conditional Port Injection for Angular CLI
Angular CLI doesn't respect the `PORT` environment variable, so we conditionally append `--port` only when not already present. Uses robust regex detection to avoid duplicate port flags:

```typescript
// Extract port early using robust regex that handles all formats:
// --port 5002, --port=5002, -p 5002, -p=5002
const portMatch = startCommand.match(/--port[= ]?(\d+)|-p[= ]?(\d+)/);
const hasPortFlag = !!portMatch;

// Angular does not respect the NodeJS.ProcessEnv.PORT set below. Port needs to be
// set directly in the CLI.
if (startCommand.includes("ng serve") && !hasPortFlag) {
  startCommand += ` --port ${port}`;
}
```

### 3. Port Mismatch Detection & Warning
Added regex-based port extraction to detect user-specified ports and warn on mismatches. Uses the same regex for both detection and validation to avoid code duplication:

```typescript
// Warn if user specified a port that differs from the emulator port
if (hasPortFlag) {
  const userPort = parseInt(portMatch[1] || portMatch[2], 10);
  if (userPort !== port) {
    logLabeledWarning(
      Emulators.APPHOSTING,
      `Custom start command specifies port ${userPort}, but emulator is using port ${port}. ` +
        `Make sure your command uses the PORT environment variable or matches the emulator port.`,
    );
  }
}
```

## Technical Changes

**Modified Files:**
- `src/emulator/apphosting/serve.ts` - Core port handling logic
- `src/emulator/apphosting/serve.spec.ts` - Updated test suite

**Key Improvements:**
- Replaced imperative validation with declarative conditional logic
- Robust regex pattern matching for port extraction: `/--port[= ]?(\d+)|-p[= ]?(\d+)/`
  - Handles: `--port 5002`, `--port=5002`, `-p 5002`, `-p=5002`
- Non-blocking warning system for port mismatches
- Idempotent port injection for Angular CLI
- Added radix parameter to `parseInt()` for safety: `parseInt(value, 10)`
- Single regex used for both detection and extraction (DRY principle)

## Testing

Updated test suite to validate new behavior with comprehensive coverage:

```typescript
it("should allow custom command with port specified and show warning", async () => {
  const startCommand = "npm run dev -- --port 5004";
  await serve.start({ startCommand });
  expect(spawnWithCommandStringStub.getCall(0).args[0]).to.eq(startCommand);
  // Assert warning is logged for port mismatch (5004 vs 5002)
  expect(logLabeledWarningStub).to.be.calledOnce;
  expect(logLabeledWarningStub.getCall(0).args[1]).to.include("5004");
});

it("should not add port to ng serve if already specified", async () => {
  const startCommand = "ng serve --port 5002";
  await serve.start({ startCommand });
  expect(spawnWithCommandStringStub.getCall(0).args[0]).to.eq(startCommand);
  // No warning since ports match (5002 === 5002)
  expect(logLabeledWarningStub).to.not.be.called;
});

it("should handle -p=5002 format correctly", async () => {
  const startCommand = "ng serve -p=5002";
  await serve.start({ startCommand });
  // Should not append port since -p is already present
  expect(spawnWithCommandStringStub.getCall(0).args[0]).to.eq(startCommand);
  expect(logLabeledWarningStub).to.not.be.called;
});

it("should handle --port=5003 format and warn on mismatch", async () => {
  const startCommand = "npm start --port=5003";
  await serve.start({ startCommand });
  expect(spawnWithCommandStringStub.getCall(0).args[0]).to.eq(startCommand);
  // Should warn about port mismatch
  expect(logLabeledWarningStub).to.be.calledOnce;
});
```

**Test Coverage:**
- ✅ Custom commands with explicit ports are accepted without modification
- ✅ Angular commands without ports receive automatic `--port` injection
- ✅ Angular commands with ports are passed through unchanged
- ✅ Port mismatch detection triggers appropriate warnings
- ✅ All port flag formats are correctly detected (`--port`, `--port=`, `-p`, `-p=`)
- ✅ Warning stub assertions verify correct logging behavior
- ✅ No regression in existing emulator functionality

**Test Results:**
```
  serve
    start
      ✓ should use user-provided port if one is defined
      ✓ should only select an available port to serve
      ✓ should run the custom start command if one is provided
      ✓ should append --port if an ng serve command is detected
      ✓ should allow custom command with port specified and show warning
      ✓ should not add port to ng serve if already specified
      ✓ should handle -p=5002 format correctly
      ✓ should handle --port=5003 format and warn on mismatch
      ✓ Should pass plaintext environment variables
      secret env vars
        ✓ Should resolve full secrets without projectId
        ✓ Should resolve full secrets versions without projectId
        ✓ Should handle secret IDs if project is provided
        ✓ Should allow explicit versions
        ✓ Should have a clear error if project ID is required but not present
    getEmulatorEnvs
      ✓ should omit apphosting emulator

  15 passing (121ms)
```

## Code Review Feedback Addressed

### 1. Improved Regex Pattern
**Feedback:** The check `!startCommand.includes(" -p ")` is fragile and won't catch `-p=5002`.

**Resolution:** Updated regex to `/--port[= ]?(\d+)|-p[= ]?(\d+)/` with optional `?` quantifier to handle all formats including `--port=5002` and `-p=5002`.

### 2. Added Radix to parseInt()
**Feedback:** Always provide a radix to `parseInt()` to prevent unexpected behavior.

**Resolution:** Changed `parseInt(portMatch[1] || portMatch[2])` to `parseInt(portMatch[1] || portMatch[2], 10)`.

### 3. Refactored Port Detection Logic
**Feedback:** Use the same regex for both detection and extraction to avoid code duplication.

**Resolution:** Extract port early with `portMatch` and reuse `hasPortFlag` boolean for both Angular CLI detection and warning logic.

### 4. Enhanced Test Coverage
**Feedback:** Add assertions for warning logs to ensure the warning logic behaves correctly.

**Resolution:** 
- Added `logLabeledWarningStub` to test setup
- Added assertions in tests to verify warning is called/not called appropriately
- Added new test cases for different port flag formats

## Breaking Changes

None. This change is backward compatible and makes the emulator more permissive.

## Related Issues

Fixes issues where developers using custom start commands with port specifications were blocked by the emulator.
