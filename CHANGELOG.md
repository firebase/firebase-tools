- Enables runtime for Cloud Functions to be set in `firebase.json` (#2241, thanks @quentinvernot!), for example:

  ```
  {
    "functions": {
      "runtime": "nodejs10"
    }
  }
  ```

- Fixes an issue where the suggested redeploy command for Firebase Functions was incorrect for names with dashes.
- Adds a the `--export-on-exit` flag to `emulators:start` and `emulators:exec` to automatically export emulator data on command exit (#2224)
- `firebase init functions` templates now use Firebase Admin SDK v9.
