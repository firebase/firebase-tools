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

## 2. Initialize Storage in your Local Project

To manage your Storage configuration and rules from your local environment, use the Firebase CLI:

1.  Run the initialization command in your project root:
    ```bash
    firebase init storage
    ```

2.  Select the **Storage** option using the arrow keys and Spacebar, then press Enter.

3.  **File for Security Rules**: Press Enter to accept the default `storage.rules`.

4.  **File for Reference Config**: Press Enter to accept the default `.firebaserc`.

This process will create:
*   `storage.rules`: A file containing your default storage security rules.
*   `firebase.json`: Configuration file updated with Storage settings.

## 3. Verify Configuration

Check your `firebase.json` file. It should look something like this:

```json
{
  "storage": {
    "rules": "storage.rules"
  }
}
```

## 4. Deploying Configuration

To deploy your Storage rules (and any other changes) to the Firebase backend:

```bash
firebase deploy --only storage
```
