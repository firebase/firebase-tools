- Updated TypeScript templates for `ext:dev:init` to fix build failures (#9524)
- Fixed a bug when `firebase emulators:start` incorrectly deletes discovery file of another emulator process (#9672)
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
