* Fixes a bug where rounds=0 was accepted for SHA1 hashes (#1617).
* Allows support for using `\n` in the `--releaseNotes` option of the `appdistribution:distribute` command (#1739).
* Functions emulator now re-uses workers to avoid running global code on each execution (#1353).
