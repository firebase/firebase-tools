- Adds support for Node.js 12 (beta) to Cloud Functions for Firebase. Specify `"node":"12"` in `package.json` or `"runtime": "nodejs12"` in `firebase.json`.
- Enables runtime for Cloud Functions to be set in `firebase.json` (#2241, thanks @quentinvernot!), for example:

  ```
  {
    "functions": {
      "runtime": "nodejs10"
    }
  }
  ```

- Fixes an issue where the suggested redeploy command for Firebase Functions was incorrect for names with dashes.
- Adds the `--export-on-exit` flag to `emulators:start` and `emulators:exec` to automatically export emulator data on command exit (#2224)
- Fixes support for camel-case query parameters in Firestore Emulator.
- Adds support for `!=` style queries in Firestore Emulator.
- Fixes connecting to host `0.0.0.0` from Emulator UI.
