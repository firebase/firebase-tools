- Added `firebase dataconnect:compile` command.
- Loads experiments earlier in CLI startup so they can be used earlier. (#9797)
- Fixed issue where `AuthBlockingEvent` had invalid format for `metadata.creationTime` and `metadata.lastSignInTime`. (#8109)
- Fixed issue where Storage security rules is overwritten when running `firebase init storage`. (#8170)
- Add support for firestoreDataAccessMode, mongodbCompatibleDataAccessMode, and
  the realtimeUpdatesMode flags for Firestore Database creation (#9817)
- Updated to v3.1.1 of the Data Connect emulator which includes fixes and internal improvements. (#9835)
