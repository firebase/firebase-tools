# Firestore Security Rules

Security rules determine who has read and write access to your database.

## Basic Structure

Rules are defined in `firestore.rules`.

```firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Rules go here
  }
}
```

## Common Patterns

### Locked Mode (Deny All)
Good for starting development or private data.
```firestore
match /{document=**} {
  allow read, write: if false;
}
```

### Test Mode (Allow All)
**WARNING: insecure.** Only for quick prototyping.
```firestore
match /{document=**} {
  allow read, write: if true;
}
```

### Auth Required
Allow access only to authenticated users.
```firestore
match /{document=**} {
  allow read, write: if request.auth != null;
}
```

### User-Specific Data
Allow users to access only their own data.
```firestore
match /users/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

## Deploying Rules

To deploy only your Firestore rules:

```bash
firebase deploy --only firestore:rules
```
