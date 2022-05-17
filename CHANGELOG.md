## Breaking

- Drops support for Node 12.
- Tooling moves to Node 16, firepit (standalone) builds move to Node 16, testing moves to 14, 16, and 18.
- Removes support for running the emulators with Java versions prior to 11.
- Removes `params` flag from ext:install, ext:update, ext:configure commands as they are replaced by the Extensions Manifest. See https://firebase.google.com/docs/extensions/manifest for more details.
- Removes `ext:dev:emulators:start` and `ext:dev:emulators:exec` preview commands.

## Not-so-breaking

- Fixes missing Connection header in RTDB emulator REST streaming API (https://github.com/firebase/firebase-tools-ui/issues/3329).
- Fixes error messaging when working with apps in interactive/non-interactive modes (#4007).
- Fixes an issue where the Extensions emulator would not work on Windows (#4554).
- Removes unused `dotenv` dependency.
- Updates `fs-extra` dependency.
- Updates `tmp` dependency.
