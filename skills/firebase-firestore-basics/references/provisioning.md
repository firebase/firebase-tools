# Provisioning Cloud Firestore

## Manual Initialization

Initialize the following firebase configuration files manually. Do not use `firebase init`, as it expects interactive inputs.

1.  **Create `firebase.json`**: This file configures the Firebase CLI.
2.  **Create `firestore.rules`**: This file contains your security rules.
3.  **Create `firestore.indexes.json`**: This file contains your index definitions.

### 1. Create `firebase.json`

Create a file named `firebase.json` in your project root with the following content. If this file already exists, instead append to the existing JSON:

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  }
}
```

This will use the default database. To use a different database, specify the database ID and location. You can check the list of available databases using `firebase firestore:databases:list`. If the database does not exist, it will be created when you deploy:

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json",
    "database": "my-database-id",
    "location": "us-central1"
  }
}
```
 
 To use Enterprise edition, specify the `enterprise` field.

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json",
    "edition": "enterprise",
    "database": "my-database-id",
    "location": "us-central1"
  }
}
```

### 2. Create `firestore.rules`

Create a file named `firestore.rules`. A good starting point (locking down the database) is:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```
*See [security_rules.md](security_rules.md) for how to write actual rules.*

### 3. Create `firestore.indexes.json`

Create a file named `firestore.indexes.json` with an empty configuration to start:

```json
{
  "indexes": [],
  "fieldOverrides": []
}
```

*See [indexes.md](indexes.md) for how to configure indexes.*


## Deploy rules and indexes
```bash
# To deploy all rules and indexes
firebase deploy --only firestore

# To deploy just rules
firebase deploy --only firestore:rules

# To deploy just indexes
firebase deploy --only firestore:indexes
```

## Local Emulation

To run Firestore locally for development and testing:

```bash
firebase emulators:start --only firestore
```

This starts the Firestore emulator, typically on port 8080. You can interact with it using the Emulator UI (usually at http://localhost:4000/firestore).
