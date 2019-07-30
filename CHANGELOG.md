* Allow passing `GOOGLE_APPLICATION_CREDENTIALS` environment variable into the functions emulator.
* Set FIREBASE_DATABASE_EMULATOR_HOST in emulators:exec.
* Add upsert API for function triggers to the database emulator.
* Fix a bug where only one RTDB function could be registered by using the RTDB emulator upsert API to register functions triggers.