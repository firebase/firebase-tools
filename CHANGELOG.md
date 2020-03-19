* **BREAKING:** Remove `firebase list` command.
* **BREAKING:** Remove `firebase tools:migrate` command.
* **BREAKING:** Remove `firebase setup:web` command.
* **BREAKING:** Increase the minimum version of `firebase-admin` in the Functions emulator from `8.0.0` to `8.9.0`.
* **BREAKING:** Increase the minimum version of `firebase-functions` in the Functions emulator from `3.0.0` to `3.3.0`.
* **BREAKING:** Remove support for top-level `hosting` config.
* **BREAKING:** `firebase serve` can no longer start the Cloud Firestore or Realtime Database emulators.
* **BREAKING:** The Cloud Functions emulator within `firebase serve` now has identical behavior to the emulator within `firebase emulators:start`.
* Updated underlying logging infrastructure.
* Replace deprecated `google-auto-auth` package with `google-auth-library`.