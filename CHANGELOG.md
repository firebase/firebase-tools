- Add declarative security support and automated rolling IAM role grants/revocations for 2nd gen Cloud Functions
- Fixed an issue in `apps:create` where App Store ID was always prompted for even when unnecessary.
- Add `functions:lifecycle:list` and `functions:lifecycle:run` commands to view and run
  lifecycle hooks in isolation.
- Updated the Firebase SQL Connect local toolkit to v3.4.15, which supports for 1:1 nested mutations. (#10773)
- Fixed `dataconnect:execute` command help text. The right env var should be FIREBASE_DATA_CONNECT_EMULATOR_HOST, with an underscore between DATA and CONNECT.
