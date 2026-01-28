# Provisioning Cloud Storage for Firebase

## 1. Enable Storage in the Firebase Console

Before you can use Cloud Storage, you need to enable it in your Firebase project:

1.  Go to the [Firebase Console](https://console.firebase.google.com/).
2.  Select your project.
3.  Navigate to **Build > Storage** in the left sidebar.
4.  Click **Get started**.
5.  Review the default security rules (you can start in **Test mode** for development, but remember to secure them later).
6.  Select a location for your default Cloud Storage bucket. **Note:** This location cannot be changed later.
7.  Click **Done**.

## 2. Manual Project Configuration

Instead of using the interactive `firebase init` command, you should manually configure your project by creating or updating the following files in your project root. This ensures a deterministic setup suitable for automation.

### Create `storage.rules`

Create a file named `storage.rules` in your project root. Here is a basic secure starting point that requires authentication for all access:

```javascript
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### Update `firebase.json`

Add the `storage` configuration to your `firebase.json` file. If the file doesn't exist, create it. This tells the Firebase CLI which rules file to use for deployment.

```json
{
  "storage": {
    "rules": "storage.rules"
  }
}
```

## 3. Verify and Deploy

To verify your configuration and deploy your Storage rules to the Firebase backend:

```bash
firebase deploy --only storage
```
