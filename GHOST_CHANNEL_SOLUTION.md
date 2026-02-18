# Ghost Channel Fix - Implementation Guide

## Problem Summary

After deleting and restoring a Firebase project, hosting operations fail with 409 errors due to a "ghost" `live` channel that exists in metadata but cannot be accessed or deleted normally.

## Solution Implemented

### 1. New `forceCreateChannel()` Function

Added to `src/hosting/api.ts`:

```typescript
export async function forceCreateChannel(
  project: string | number = "-",
  site: string,
  channelId: string,
  ttlMillis: number = DEFAULT_DURATION,
  force: boolean = false,
): Promise<Channel>
```

**Behavior:**
- Attempts to create a channel normally
- If 409 error occurs and `force=true`, deletes the existing channel and recreates it
- Provides helpful error messages if deletion fails (indicating a true ghost channel)

### 2. Updated `hosting:channel:create` Command

Modified `src/commands/hosting-channel-create.ts`:

**New Flag:**
```bash
--force    Force channel creation by deleting and recreating if it already exists
```

**Usage:**
```bash
firebase hosting:channel:create live --force
```

**Improved Error Messages:**
- 409 errors now suggest using `--force` flag for ghost channels
- Clear guidance on recovery steps

### 3. Enhanced `hosting:sites:list` Command

Modified `src/commands/hosting-sites-list.ts`:

**Improvements:**
- Better error handling for 409 errors
- Provides recovery steps in error messages
- Suggests using `--force` flag or contacting support

### 4. Comprehensive Tests

Added to `src/hosting/api.spec.ts`:

- Test for normal channel creation with force flag
- Test for delete-and-recreate scenario
- Test for ghost channel error handling
- Test for force=false behavior

## Usage Guide

### For Users Experiencing Ghost Channel Issues

#### Step 1: Identify the Problem
```bash
firebase hosting:sites:list
# Error: Conflict error (409)...
```

#### Step 2: Try Force Recreation
```bash
firebase hosting:channel:create live --force
```

This will:
1. Attempt to delete the ghost channel
2. Recreate it with proper configuration
3. Restore normal hosting operations

#### Step 3: If Force Recreation Fails

The error message will indicate this is a backend issue requiring support:
```
Channel live already exists and could not be deleted.
This may be a ghost channel from a previous project deletion.
Please contact Firebase support or try deleting the site and recreating it.
```

### For Developers

#### Using the API Directly

```typescript
import { forceCreateChannel } from "../hosting/api";

// Normal creation
const channel = await forceCreateChannel(projectId, siteId, "live");

// Force recreation (handles ghost channels)
const channel = await forceCreateChannel(projectId, siteId, "live", DEFAULT_DURATION, true);
```

#### Error Handling

```typescript
try {
  const channel = await forceCreateChannel(projectId, siteId, channelId, ttl, true);
} catch (error) {
  if (error.message.includes("ghost channel")) {
    // This is a backend issue - escalate to support
    console.error("Ghost channel detected - contact Firebase support");
  } else {
    // Handle other errors
  }
}
```

## Testing

### Manual Testing Steps

1. **Setup:**
   ```bash
   # Create a test project
   firebase projects:create test-ghost-channel
   ```

2. **Simulate Ghost Channel:**
   - Delete project via Firebase Console
   - Restore via GCP Console
   - Re-add Firebase

3. **Test Recovery:**
   ```bash
   # Should fail with 409
   firebase hosting:sites:list
   
   # Should provide helpful error
   firebase hosting:channel:create live
   
   # Should succeed and fix the issue
   firebase hosting:channel:create live --force
   
   # Should now work
   firebase hosting:sites:list
   ```

### Automated Tests

Run the test suite:
```bash
npm test -- src/hosting/api.spec.ts
```

Expected results:
- ✓ should create a channel normally when it doesn't exist
- ✓ should delete and recreate channel when it exists and force is true
- ✓ should throw helpful error when channel exists and cannot be deleted
- ✓ should throw original error when force is false

## Backward Compatibility

✅ **Fully backward compatible:**
- `--force` flag is optional
- Default behavior unchanged
- Existing scripts and workflows continue to work
- No breaking changes to API signatures

## Limitations

### What This Fix Handles:
- Ghost channels that can be deleted via API
- Corrupted channel metadata
- Channel conflicts after project restoration

### What This Fix Cannot Handle:
- Backend-level corruption requiring Google intervention
- Channels that cannot be deleted due to backend locks
- Issues with the underlying site (not just channels)

### When to Contact Support:
If `--force` flag fails with the ghost channel error message, this indicates a backend issue that requires Firebase support intervention.

## Future Improvements

### Potential Enhancements:
1. **Automatic Detection:** Detect ghost channels automatically during `firebase init`
2. **Bulk Cleanup:** Add command to clean up all ghost channels in a project
3. **Prevention:** Better cleanup during project deletion
4. **Diagnostics:** Add `firebase hosting:diagnose` command to check for issues

### API Improvements Needed:
1. Backend should prevent ghost channels during project deletion/restoration
2. Better error codes to distinguish ghost channels from normal conflicts
3. Idempotent channel creation (create-or-update semantics)

## Related Issues

- Firebase CLI Issue: Ghost channels after project restoration
- Affects: `hosting:sites:list`, `hosting:sites:create`, `hosting:channel:create`, `deploy --only hosting`
- Root cause: Incomplete cleanup during project deletion
- Workaround: Use `--force` flag or contact Firebase support

## Support Resources

- Firebase CLI Documentation: https://firebase.google.com/docs/cli
- Firebase Support: https://firebase.google.com/support
- GitHub Issues: https://github.com/firebase/firebase-tools/issues
