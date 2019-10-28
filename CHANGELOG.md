* Fixes a bug where rounds=0 was accepted for SHA1 hashes (#1617).
* Allows support for using `\n` in the `--releaseNotes` option of the `appdistribution:distribute` command (#1739).
* Specifies schema version when dealing with IAM Policies related to Extensions.
* Functions emulator now re-uses workers to avoid running global code on each execution (#1353).
* Improves error handling of unreachable regions for Cloud Functions deploys.
