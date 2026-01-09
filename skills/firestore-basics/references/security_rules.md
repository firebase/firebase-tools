# Firestore Security Rules Structure

Security rules determine who has read and write access to your database.

## Service and Database Declaration

All Firestore rules begin with the service declaration and a match block for the database (usually default).

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    // Rules go here
    // {database} wildcard represents the database name
  }
}
```

## Basic Read/Write Operations

Rules describe **conditions** that must be true to allow an operation.

```
match /cities/{city} {
  allow read: if <condition>;
  allow write: if <condition>;
}
```

## Common Patterns

### Locked Mode (Deny All)
Good for starting development or private data.
```
match /{document=**} {
  allow read, write: if false;
}
```

### Test Mode (Allow All)
**WARNING: insecure.** Only for quick prototyping. Unsafe to deploy for production apps.
```
match /{document=**} {
  allow read, write: if true;
}
```

### Auth Required
Allow access only to authenticated users. This allows any logged in user access to all data.
```
match /{document=**} {
  allow read, write: if request.auth != null;
}
```

### User-Specific Data
Allow users to access only their own data.
```
match /users/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

### Allow only verified emails
Requires users to verify ownership of the email address before using it to read or write data
```
// Allow access based on email domain
match /some_collection/{document} {
  allow read: if request.auth != null
              && request.auth.email_verified
              && request.auth.email.endsWith('@example.com');
}
```

### Validate data in write operations
```
// Example for creating a user profile
match /users/{userId} {
  allow create: if request.auth.uid == userId &&
                   request.resource.data.email is string &&
                   request.resource.data.createdAt == request.time;
}
```

### Granular Operations

You can break down `read` and `write` into more specific operations:

*   **read**
    *   `get`: Retrieval of a single document.
    *   `list`: Queries and collection reads.
*   **write**
    *   `create`: Writing to a nonexistent document.
    *   `update`: Writing to an existing document.
    *   `delete`: Removing a document.

```firestore
match /cities/{city} {
  allow get: if <condition>;
  allow list: if <condition>;
  allow create: if <condition>;
  allow update: if <condition>;
  allow delete: if <condition>;
}
```

## Hierarchical Data

Rules applied to a parent collection **do not** cascade to subcollections. You must explicitly match subcollections.

### Nested Match Statements

Inner matches are relative to the outer match path.

```firestore
match /cities/{city} {
  allow read, write: if <condition>;

  // Explicitly match the subcollection 'landmarks'
  match /landmarks/{landmark} {
    allow read, write: if <condition>;
  }
}
```

### Recursive Wildcards (`{name=**}`)

Use recursive wildcards to apply rules to an arbitrarily deep hierarchy.

*   **Version 2** (recommended): `{path=**}` matches zero or more path segments.

```firestore
// Allow read access to ANY document in the 'cities' collection or its subcollections
match /cities/{document=**} {
  allow read: if true;
}
```

## Controlling Field Access

### Read Limitations

Reads in Firestore are **document-level**. You cannot retrieve a partial document.
*   **Allowed**: Read the entire document.
*   **Denied**: logical failure, no data returned.

To secure specific fields (e.g., private user data), you must **split them into a separate document** (e.g., a `private` subcollection).

### Write Restrictions

You can strictly control which fields can be written or updated.

#### On Creation
Use `request.resource.data.keys()` to validate fields.

```firestore
match /restaurant/{restId} {
  allow create: if request.resource.data.keys().hasAll(['name', 'location']) &&
                   request.resource.data.keys().hasOnly(['name', 'location', 'city', 'address']);
}
```

#### On Update
Use `diff()` to see what changed between the existing document (`resource.data`) and the incoming data (`request.resource.data`).

```firestore
match /restaurant/{restId} {
  allow update: if request.resource.data.diff(resource.data).affectedKeys()
        .hasOnly(['name', 'location', 'city']); // Prevent others from changing
}
```

### Enforcing Field Types
Use the `is` operator to validate data types.

```firestore
allow create: if request.resource.data.score is int &&
                 request.resource.data.active is bool &&
                 request.resource.data.tags is list;
```

## Understanding Rule Evaluation

### Overlapping Matches -> OR Logic

If a document matches more than one rule statement, access is allowed if **ANY** of the matching rules allow it.

```firestore
// Document: /cities/SF

match /cities/{city} {
  allow read: if false; // Deny
}

match /cities/{document=**} {
  allow read: if true;  // Allow
}

// Result: ALLOWED (because one rule returned true)
```

## Common Limits

*   **Call Depth**: Maximum call depth for custom functions is 20.
*   **Document Access**:
    *   10 access calls for single-doc requests/queries.
    *   20 access calls for multi-doc reads/transactions/batches.
*   **Size**: Ruleset source max 256 KB. Compiled max 250 KB.

## Deploying

```bash
firebase deploy --only firestore:rules
```
