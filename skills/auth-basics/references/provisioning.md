# Provisioning Firebase Authentication

## 1. Enabling Authentication in Console
The primary way to configure Authentication providers is through the Firebase Console.

1.  Go to the [Firebase Console](https://console.firebase.google.com/).
2.  Select your project.
3.  Navigate to **Authentication** > **Get started** (if first time) or **Sign-in method**.
4.  Enable the desired Sign-in providers (e.g., Email/Password, Google).

## 2. CLI Initialization
You can initialize Authentication locally, which is especially useful for setting up emulators coverage.

```bash
firebase init auth
```

This command will:
- Ask if you want to enable the Authentication Emulator.
- Create/Update `firebase.json` with emulator configuration.

## 3. Emulators
The Firebase Authentication Emulator allows you to test authentication flows locally without creating real users in production.

To start the emulator:
```bash
firebase emulators:start
```

- The Auth Emulator usually runs on port `9099`.
- It provides a local UI (Emulator UI) where you can view and manage emulated users on port `4000` (default).
