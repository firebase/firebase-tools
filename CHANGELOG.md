- Added support for enabling Firebase Authentication providers via `firebase deploy`. You can configure providers in `firebase.json` like so:

```json
{
  "auth": {
    "providers": {
      "anonymous": true,
      "emailPassword": true,
      "googleSignIn": {
        "oAuthBrandDisplayName": "My App",
        "supportEmail": "support@myapp.com"
      }
    }
  }
}
```

- Added initial zip deploy support in functions deploy for HTTP functions (#9707)
- Fixes an issue where Python was missing from the firebase-tools Docker image (#9855).
- Fixes billing information check to use user's project quota (#9879).
- Updated the Firebase Data Connect local toolkit to v3.1.2, which contains the following changes: (#9882)
  - Improved insecure operation warning messages and reduced the severity of existing insecure operation warnings to LOG_ONLY.
  - Updated the Golang dependency version from 1.24.4 to 1.24.12.
- Fixes issue where auth emulator multi-tenant mode exports/imports only users tied to the default tenant (#5623)
- Updated Pub/Sub emulator to version 0.8.27.
- Update emulator version to v 3.1.3 to enable native SQL feature for dataconnect.
