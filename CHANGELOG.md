* Added support for managing the Realtime Database setting `strictTriggerValidation`.
* Fixes trigger parser to not rely on prototype methods (#1687).
* Fixes bug where standalone CLI would hang in the Android Studio integrated terminal.
* Fixes a bug where accessing refs from background function arguments would point to prod (#1682).
* Verifies required permissions on feature initialization.
* Fixes a bug where rounds=0 was accepted for SHA1 hashes (#1617).
* Allows support for using `\n` in the `--releaseNotes` option of the `appdistribution:distribute` command (#1739).
