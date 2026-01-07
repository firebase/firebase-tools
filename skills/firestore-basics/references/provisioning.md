# Provisioning Cloud Firestore

## CLI Initialization

To set up Firestore in your project directory, use the Firebase CLI:

```bash
firebase init firestore
```

This command will:
1.  Ask you to select a default Firebase project (or create a new one).
2.  Create a `firestore.rules` file for your security rules.
3.  Create a `firestore.indexes.json` file for your index definitions.
4.  Update your `firebase.json` configuration file.

## Configuration (firebase.json)

Your `firebase.json` should include the `firestore` key pointing to your rules and indexes:

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  }
}
```

## Local Emulation

To run Firestore locally for development and testing:

```bash
firebase emulators:start --only firestore
```

This starts the Firestore emulator, typically on port 8080. You can interact with it using the Emulator UI (usually at http://localhost:4000/firestore).
