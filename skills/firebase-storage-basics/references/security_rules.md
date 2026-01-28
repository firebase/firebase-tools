# Firebase Storage Security Rules

Firebase Security Rules for Cloud Storage determine who has read and write access to files stored in Cloud Storage, as well as how files are structured and what metadata they contain.

## Basic Structure

Storage rules are defined in a `service firebase.storage` block. Match statements point to specific file paths.

```javascript
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

*   `match /b/{bucket}/o`: This is the required entry point for all Storage rules.
*   `match /{allPaths=**}`: Matches all files in the bucket.
*   `allow read, write`: Grants permission.

## Granular Access Control

You can write rules for specific paths to control access more granularly:

```javascript
service firebase.storage {
  match /b/{bucket}/o {
    // User profile images: Publicly readable, writable only by the user
    match /users/{userId}/profile.jpg {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Private user files: Only accessible by the user
    match /users/{userId}/private/{fileName} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Validating File Metadata

You can also validate file properties like size and content type:

```javascript
allow write: if request.resource.size < 5 * 1024 * 1024 // 5MB
             && request.resource.contentType.matches('image/.*');
```

## Workflow for Secure Rules

To ensure your rules are robust, follow this workflow:

### 1. Analyze Requirements
Identify:
*   **Paths**: What files are you storing? (e.g., `/users/{uid}/avatar.png`)
*   **Access**: Who can read/write? (e.g., Public read, Owner write)
*   **Constraints**: Max size? Specific content types?

### 2. Draft Rules
Start with **Default Deny** and open up permissions only as needed.

### 3. "Devil's Advocate" Attack (Critical Step)
Attempt to break your own rules mentally or via tests:
1.  **Unauthorized Access**: Can user A read user B's private file?
2.  **Path Traversal**: Can I write to a path not explicitly defined?
3.  **Validation Bypass**: Can I upload a 1GB file if the limit is 5MB? Can I upload an `.exe` instead of `.jpg`?
4.  **Unauthenticated Access**: What happens if `request.auth` is null?

### 4. Automated Testing
Use the Firebase Emulator and `@firebase/rules-unit-testing` to write unit tests for your rules.

**Example Test Plan:**
*   Authorized upload (should succeed)
*   Unauthorized upload (should fail)
*   File size limit check (should fail if too large)
*   Wrong file type (should fail)
*   Public read (should succeed)
*   Private read (unauthorized user should fail)

## Deploying Rules

```bash
firebase deploy --only storage
```
