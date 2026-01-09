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

- Fixes an issue where the `--only` flag was not always respected for `firebase mcp`
