<<<<<<< HEAD
- Updated Firestore Emulator to v1.20.2, which includes minor bug fixes for Datastore Mode.
- Improved command loading performance by implementing lazy loading.
- [BREAKING] Changed `firestore:backups:list --json` to return a `listBackupsResponse` object instead of a raw array of backups.
- [BREAKING] Removed support for '.bolt' rules files.
- [BREAKING] Removed support for running emulators with Java versions prior to 21.
- Add a confirmation in `firebase init dataconnect` before asking for app idea description. (#9282)
- [BREAKING] Removed deprecated `firebase --open-sesame` and `firebase --close-sesame` commands. Use `firebase experiments:enable` and `firebase experiments:disable` instead.
- [BREAKING] Enforce strict timeout validation for functions. (#9540)
- [BREAKING] Update `dataconnect:\*` commands to use flags instead of positional arguments for `--service` & `--location`. Changed output type of `dataconnect:sql:migrate --json` (#9312)
=======
>>>>>>> origin/main
