## Breaking

- Drops support for Node 12.
- Tooling moves to Node 16, firepit (standalone) builds move to Node 16, testing moves to 14, 16, and 18.
- Removes support for running the emulators with Java versions prior to 11.
- Removes `params` flag from ext:install, ext:update, ext:configure commands as they are replaced by the Extensions Manifest. See https://firebase.google.com/docs/extensions/manifest for more details.
- Removes `ext:dev:emulators:start` and `ext:dev:emulators:exec` preview commands.

## Not-so-breaking

- Fix missing Connection header in RTDB emulator REST streaming API (https://github.com/firebase/firebase-tools-ui/issues/3329).
- Removes unused `dotenv` dependency.
