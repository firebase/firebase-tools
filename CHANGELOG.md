- Release Cloud Firestore emulator v1.14.1:
  - Adds support of x-goog-request-params http header for routing.
  - Changes `read-past-max-staleness` error code to align with production
    implementation.
  - Updates readtime-in-the-future error message.
  - Supports importing exports from Windows on UNIX systems. (#2421)
- Marks Java 10 and below as deprecated. Support will be dropped in Firebase CLI v11. Please upgrade to Java version 11 or above to continue using the emulators. (#4347)
