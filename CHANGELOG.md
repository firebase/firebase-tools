* **BREAKING:** Removes `firebase list` command (replacement: `firebase projects:list`).
* **BREAKING:** Removes `firebase tools:migrate` command.
* **BREAKING:** Removes `firebase setup:web` command (replacement: `firebase apps:sdkconfig web`).
* **BREAKING:** Increases the minimum version of `firebase-admin` in the Cloud Functions for Firebase emulator from `8.0.0` to `8.9.0`.
* **BREAKING:** Increases the minimum version of `firebase-functions` in the Cloud Functions for Firebase emulator from `3.0.0` to `3.3.0`.
* **BREAKING:** Removes support for top-level Firebase Hosting config in `firebase.json`. [Firebase Hosting configuration](https://firebase.google.com/docs/hosting/full-config) must be under the `hosting` key in `firebase.json`.
* **BREAKING:** `firebase serve` can no longer start the Cloud Firestore or Realtime Database emulators.
* **BREAKING:** Unifies the Cloud Functions for Firebase emulator within `firebase serve` and `firebase emulators:start`.
* **BREAKING**: Removes support for separate WebChannel port in the Cloud Firestore emulator. Use the main port instead.
* **BREAKING**: Rejects Firebase project IDs with invalid format.
* Updates underlying logging infrastructure.
* Replaces deprecated `google-auto-auth` package with `google-auth-library`.
