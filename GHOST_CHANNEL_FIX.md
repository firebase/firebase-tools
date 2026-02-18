# Fix for Ghost Channel Issue After Project Restoration

## Problem
After deleting and restoring a Firebase project, a "ghost" `live` channel blocks all hosting operations with 409 errors.

## Root Cause
When a Firebase project is deleted and restored:
1. The hosting site metadata is partially restored
2. The `live` channel exists in backend metadata but is inaccessible
3. All hosting API calls fail because the channel "already exists" but can't be accessed or deleted

## Proposed Solution

### Option 1: Add Force Flag to Channel Creation (Recommended)
Add a `--force` flag to channel creation commands that attempts to delete and recreate the channel if it already exists.

### Option 2: Add Channel Cleanup Command
Create a new command `firebase hosting:channel:cleanup` that forcefully removes ghost channels.

### Option 3: Automatic Recovery in Existing Commands
Modify existing commands to detect and recover from ghost channel scenarios automatically.

## Implementation

### Files to Modify:

1. **src/hosting/api.ts**
   - Add `forceCreateChannel()` function that handles 409 errors gracefully
   - Add retry logic with channel deletion

2. **src/commands/hosting-channel-create.ts**
   - Add `--force` flag option
   - Use `forceCreateChannel()` when force flag is set

3. **src/commands/hosting-sites-list.ts**
   - Add better error handling for 409 errors
   - Provide helpful error messages with recovery steps

## Workaround for Users (Current)

Until this fix is implemented, users can try:

1. **Use Firebase Console**
   - Go to Firebase Console → Hosting
   - Try to delete the site and recreate it

2. **Use REST API directly**
   ```bash
   # Get access token
   firebase login:ci
   
   # Delete the ghost channel (may fail)
   curl -X DELETE \
     "https://firebasehosting.googleapis.com/v1beta1/projects/PROJECT_NUMBER/sites/SITE_ID/channels/live" \
     -H "Authorization: Bearer ACCESS_TOKEN"
   
   # Recreate the site
   firebase hosting:sites:create SITE_ID --force
   ```

3. **Contact Firebase Support**
   - This appears to be a backend issue that may require Google support intervention

## Testing Plan

1. Create a test project
2. Delete the project
3. Restore via GCP Console
4. Re-add Firebase
5. Verify the fix resolves the ghost channel issue
6. Ensure backward compatibility with normal channel operations

## Related Issues

This fix addresses the scenario described in the user's issue where:
- `firebase hosting:sites:list` → 409
- `firebase hosting:sites:create` → 409  
- `firebase deploy --only hosting` → 404
- Channel `chok0908/channels/live` blocks all operations
