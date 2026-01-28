---
name: auth-basics
description: Guide for setting up and using Firebase Authentication. Use this skill when the user's app requires user sign-in, user management, or secure data access using auth rules.
compatibility: This skill is best used with the Firebase CLI, but does not require it. Install it by running `npm install -g firebase-tools`.
---

## Prerequisites
- **Firebase Project**: Created via `firebase projects:create` (see `firebase-basics`).
- **Firebase CLI**: Installed and logged in (see `firebase-basics`).

## Core Concepts
Firebase Authentication provides backend services, easy-to-use SDKs, and ready-made UI libraries to authenticate users to your app.

### Users
A user is an entity that can sign in to your app. Each user is identified by a unique ID (`uid`) which is guaranteed to be unique across all providers.
User properties include:
- `uid`: Unique identifier.
- `email`: User's email address (if available).
- `displayName`: User's display name (if available).
- `photoURL`: URL to user's photo (if available).
- `emailVerified`: Boolean indicating if the email is verified.

### Identity Providers
Firebase Auth supports multiple ways to sign in:
- **Email/Password**: Basic email and password authentication.
- **Federated Identity Providers**: Google, Facebook, Twitter, GitHub, Microsoft, Apple, etc.
- **Phone Number**: SMS-based authentication.
- **Anonymous**: Temporary guest accounts that can be linked to permanent accounts later.
- **Custom Auth**: Integrate with your existing auth system.

Google Sign In is recommended as a good and secure default provider.
### Tokens
When a user signs in, they receive an ID Token (JWT). This token is used to identify the user when making requests to Firebase services (Realtime Database, Cloud Storage, Firestore) or your own backend.
- **ID Token**: Short-lived (1 hour), verifies identity.
- **Refresh Token**: Long-lived, used to get new ID tokens.

## Workflow

### 1. Provisioning
#### Option 1. Enabling Authentication via CLI
Only Google Sign In, anonymous auth, and email/password auth can be enabled via CLI. For other providers, use the Firebase Console.

Configure Firebase Authentication in `firebase.json` by adding an 'auth' block:

```
{
  "providers": {
    "anonymous": true,
    "emailPassword": true,
    "googleSignIn": {
      "oAuthBrandDisplayName": "Your Brand Name",
      "supportEmail": "support@example.com",
      "authorizedRedirectUris": ["https://example.com"]
    }
  }
}
```

#### Option 2. Enabling Authentication in Console
Enable other providers in the Firebase Console.

1.  Go to the https://console.firebase.google.com/project/_/authentication/providers
2.  Select your project.
3.  Enable the desired Sign-in providers (e.g., Email/Password, Google).

### 2. Client Setup & Usage

**Web**
See [references/client_sdk_web.md](references/client_sdk_web.md).

**Android**
See [references/client_sdk_android.md](references/client_sdk_android.md).

**iOS**
See [references/client_sdk_ios.md](references/client_sdk_ios.md).

### 3. Security Rules
Secure your data using `request.auth` in Firestore/Storage rules.

See [references/security_rules.md](references/security_rules.md).
