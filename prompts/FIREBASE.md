# Firebase CLI Context

<project-structure>
```
project/
├── firebase.json          # Main configuration
├── .firebaserc           # Project aliases
├── firestore.rules       # Security rules
├── functions/            # Cloud Functions
├── public/               # Hosting files
└── firebase-debug.log    # Created when CLI commands fail
```
</project-structure>

## Common Commands

<example>
```bash
# Initialize new features
firebase init hosting
firebase init functions
firebase init firestore

# Deploy everything or specific services

firebase deploy
firebase deploy --only hosting
firebase deploy --only functions:processOrder,functions:sendEmail
firebase deploy --except functions

# Switch between projects

firebase use staging
firebase use production

````
</example>

## Local Development

<example>
```bash
# Start all emulators
firebase emulators:start

# Start specific emulators
firebase emulators:start --only functions,firestore

# Common emulator URLs
# Emulator UI: http://localhost:4000
# Functions: http://localhost:5001
# Firestore: http://localhost:8080
# Hosting: http://localhost:5000
````

</example>

## Debugging Failed Commands

<example>
```bash
# When any firebase command fails
cat firebase-debug.log    # Contains detailed error traces

# Common fixes for errors in debug log

firebase login --reauth # Fix authentication errors
firebase use # Fix wrong project errors

````
</example>

## Complete Workflow Example

<example>
```bash
# Clone and setup a Firebase project
git clone https://github.com/example/my-app
cd my-app

# Initialize Firebase in existing project
firebase init

# Start local development
firebase emulators:start

# Make changes, then deploy to staging
firebase use staging
firebase deploy

# Deploy to production
firebase use production
firebase deploy --only hosting,firestore
````

</example>

## Service Detection in firebase.json

<example>
```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"]
  },
  "functions": {
    "source": "functions",
    "runtime": "nodejs20"
  },
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "emulators": {
    "functions": { "port": 5001 },
    "firestore": { "port": 8080 },
    "hosting": { "port": 5000 }
  }
}
```
</example>
