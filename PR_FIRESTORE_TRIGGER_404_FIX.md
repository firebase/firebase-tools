# Fix: Provide helpful error message when Firestore database doesn't exist during function deployment

## Problem

When deploying Firebase Functions with Firestore triggers, if the Firestore database doesn't exist in the project, the deployment fails with a generic 404 error that doesn't clearly explain the issue:

```
Error: Request to https://firestore.googleapis.com/v1/projects/deliverly-dev-89a85/databases/(default) had HTTP Error: 404, 
Project 'deliverly-dev-89a85' or database '(default)' does not exist.
```

This error message is confusing because:
1. It doesn't clearly indicate that the Firestore database needs to be created first
2. It doesn't provide guidance on how to resolve the issue
3. Other functions (HTTPS, non-Firestore triggers) deploy successfully, making it unclear why Firestore triggers specifically fail

## Root Cause

The `ensureFirestoreTriggerRegion` function in `src/deploy/functions/services/firestore.ts` calls `getDatabase()` to retrieve the Firestore database location and validate that the trigger region matches the database region. However, when the database doesn't exist, `getDatabase()` throws a 404 error that propagates up without proper error handling or user-friendly messaging.

## Solution

Added proper error handling in `ensureFirestoreTriggerRegion` to catch 404 errors and provide a clear, actionable error message that:
1. Explicitly states which database doesn't exist
2. Identifies the project where the database is missing
3. Provides a direct link to the Firebase Console to create the database

### Implementation

```typescript
export async function ensureFirestoreTriggerRegion(
  endpoint: backend.Endpoint & backend.EventTriggered,
): Promise<void> {
  let database = endpoint.eventTrigger.eventFilters?.database;
  if (!database) {
    const resource = endpoint.eventTrigger.eventFilters?.resource;
    const match = resource?.match(/^projects\/[^/]+\/databases\/([^/]+)/);
    if (match) {
      database = match[1];
    } else {
      database = "(default)";
    }
  }

  let db: firestore.Database;
  try {
    db = await getDatabase(endpoint.project, database);
  } catch (err: any) {
    if (err.status === 404) {
      throw new FirebaseError(
        `Firestore database '${database}' does not exist in project '${endpoint.project}'. ` +
          `Please create the database first by visiting: ` +
          `https://console.firebase.google.com/project/${endpoint.project}/firestore`,
      );
    }
    throw err;
  }

  const dbRegion = db.locationId;
  if (!endpoint.eventTrigger.region) {
    endpoint.eventTrigger.region = dbRegion;
  }
  if (endpoint.eventTrigger.region !== dbRegion) {
    throw new FirebaseError(
      "A firestore trigger location must match the firestore database region.",
    );
  }
}
```

### New Error Message

**Before:**
```
Error: Request to https://firestore.googleapis.com/v1/projects/my-project/databases/(default) had HTTP Error: 404, 
Project 'my-project' or database '(default)' does not exist.
```

**After:**
```
Error: Firestore database '(default)' does not exist in project 'my-project'. 
Please create the database first by visiting: https://console.firebase.google.com/project/my-project/firestore
```

## Technical Changes

**Modified Files:**
- `src/deploy/functions/services/firestore.ts` - Added 404 error handling with helpful message
- `src/deploy/functions/services/firestore.spec.ts` - Added comprehensive test coverage

**Key Improvements:**
1. **Explicit error handling** - Catches 404 errors specifically and provides context
2. **Actionable guidance** - Includes direct link to Firebase Console
3. **Database name clarity** - Shows which database (default or custom) is missing
4. **Project identification** - Clearly states which project needs the database
5. **Non-404 error preservation** - Other errors are rethrown unchanged

## Testing

Added comprehensive test coverage for the new error handling:

### Test Cases

```typescript
it("should throw a helpful error when database does not exist (404)", async () => {
  const error404 = new Error("Not found");
  (error404 as any).status = 404;
  firestoreStub.rejects(error404);

  const ep: any = {
    project: projectNumber,
    eventTrigger: {
      eventFilters: { database: "(default)" },
    },
  };

  await expect(ensureFirestoreTriggerRegion(ep)).to.be.rejectedWith(
    `Firestore database '(default)' does not exist in project '${projectNumber}'`,
  );
});

it("should throw a helpful error for non-default database that does not exist", async () => {
  const error404 = new Error("Not found");
  (error404 as any).status = 404;
  firestoreStub.rejects(error404);

  const ep: any = {
    project: projectNumber,
    eventTrigger: {
      eventFilters: { database: "my-custom-db" },
    },
  };

  await expect(ensureFirestoreTriggerRegion(ep)).to.be.rejectedWith(
    `Firestore database 'my-custom-db' does not exist in project '${projectNumber}'`,
  );
});

it("should rethrow non-404 errors", async () => {
  const error500 = new Error("Internal server error");
  (error500 as any).status = 500;
  firestoreStub.rejects(error500);

  const ep: any = {
    project: projectNumber,
    eventTrigger: {
      eventFilters: { database: "(default)" },
    },
  };

  await expect(ensureFirestoreTriggerRegion(ep)).to.be.rejectedWith("Internal server error");
});
```

**Test Results:**
```
  ensureFirestoreTriggerRegion
    ✓ should throw an error if the trigger region is different than the firestore region
    ✓ should not throw if the trigger region is not set
    ✓ should not throw if the trigger region is set correctly
    ✓ should parse database from resource if database is not set
    ✓ should cache database lookups to prevent multiple API calls
    ✓ should make separate API calls for different databases
    ✓ should throw a helpful error when database does not exist (404)
    ✓ should throw a helpful error for non-default database that does not exist
    ✓ should rethrow non-404 errors

  9 passing (29ms)
```

## User Impact

### Before This Fix
Users would see a cryptic 404 error and have to:
1. Search for the error message online
2. Figure out they need to create a Firestore database
3. Navigate to the Firebase Console manually
4. Find the Firestore section
5. Create the database

### After This Fix
Users immediately see:
1. Which database is missing
2. Which project needs the database
3. A direct link to create the database
4. Clear next steps to resolve the issue

## Breaking Changes

None. This change only improves error messaging and doesn't affect successful deployments or API behavior.

## Related Issues

Fixes #10015 - Firestore Trigger Deployment Fails with 404 – Database "(default)" Does Not Exist

## Additional Context

This fix aligns with Firebase CLI's philosophy of providing clear, actionable error messages that help developers quickly resolve issues. Similar error handling patterns exist in other parts of the codebase:

- `src/firestore/checkDatabaseType.ts` - Already handles 404 errors gracefully
- `src/init/features/firestore/indexes.ts` - Returns null for 404 errors
- `src/deploy/firestore/prepare.ts` - Handles database creation when 404 is encountered

This change brings Firestore trigger deployment error handling in line with these existing patterns.
