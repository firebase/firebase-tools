# Authentication in Security Rules

Firebase Security Rules work with Firebase Authentication to provide rule-based access control. For better advice on writing safe security rules,
enable the `firestore-basics`  or `storage-basics` skills.
 
The `request.auth` variable contains authentication information for the user requesting data.

## Basic Checks

### Check if user is signed in
```
allow read, write: if request.auth != null;
```

### Check if user owns the data
Access data only if the document ID matches the user's UID.
```
allow read, write: if request.auth != null && request.auth.uid == userId;
```
(Where `userId` is a path variable, e.g., `match /users/{userId}`)

### Check if user owns the document (field-based)
Access data only if the document has a `owner_uid` field matching the user's UID.
```
allow read, write: if request.auth != null && request.auth.uid == resource.data.owner_uid;
```

## Token Properties
`request.auth.token` contains standard JWT claims and custom claims.

- `request.auth.token.email`: The user's email address.
- `request.auth.token.email_verified`: If the email is verified.
- `request.auth.token.name`: The user's display name.

### Example: Email Verification Check
```
allow create: if request.auth.token.email_verified == true;
```
