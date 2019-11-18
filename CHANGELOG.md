* Fixes a bug where the Functions emulator ignored the "host" configuration (#1722)
* Fixes a bug where the Functions emulator accepted requests to too many paths (#1773)
* Modifies `firebase ext:update` to not perform update if the extension is already up to date.
* Print Firebase Console links for Extensions after operations.
* Updated Firebase Extensions registry address.
* Adds the `firebase init emulators` command.
* Adds a Cloud Pub/Sub Emulator (#1748).
* Fixes a bug where the Firestore emulator was unable to serve rule coverage HTML reports.
* Fixes a bug in the Firestore emulator where rapidly overwriting the same document could trigger exceptions.
