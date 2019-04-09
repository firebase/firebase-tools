"use strict";

var userHome = require("user-home");
var path = require("path");

const CACHE_DIR =
  process.env.FIREBASE_EMULATORS_PATH || path.join(userHome, ".cache", "firebase", "emulators");

const _emulators = {
  database: {
    name: "database",
    instance: null,
    port: 9000,
    stdout: null,
    cacheDir: CACHE_DIR,
    remoteUrl:
      "https://storage.googleapis.com/firebase-preview-drop/emulator/firebase-database-emulator-v3.5.0.jar",
    expectedSize: 17013124,
    expectedChecksum: "4bc8a67bc2a11d3e7ed226eda1b1a986",
    localPath: path.join(CACHE_DIR, "firebase-database-emulator-v3.5.0.jar"),
  },
  firestore: {
    name: "firestore",
    instance: null,
    port: 8080,
    stdout: null,
    cacheDir: CACHE_DIR,
    remoteUrl:
<<<<<<< HEAD
      "https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.4.3.jar",
    expectedSize: 56842642,
    expectedChecksum: "27cd1dbf20e7ded5e6b90ecf23cbed2b",
    localPath: path.join(CACHE_DIR, "cloud-firestore-emulator-v1.4.3.jar"),
=======
      "https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.4.4.jar",
    expectedSize: 56904597,
    expectedChecksum: "b64aa203304f231b61ad7c30316d1094",
    localPath: path.join(CACHE_DIR, "cloud-firestore-emulator-v1.4.4.jar"),
>>>>>>> private/ah-emulator-suite
  },
};

const _commands = {
  database: {
    binary: "java",
    args: ["-Duser.language=en", "-jar", _emulators.database.localPath],
  },
  firestore: {
    binary: "java",
    args: ["-Duser.language=en", "-jar", _emulators.firestore.localPath],
  },
};

function _getCommand(emulator, port) {
  var baseCmd = _commands[emulator];

  var defaultPort = _emulators[emulator].port;
  var port = port || defaultPort;

  var args = baseCmd.args.concat(["--port", port]);

  return {
    binary: baseCmd.binary,
    args,
  };
}

module.exports = {
  emulators: _emulators,
  commands: _commands,
  getCommand: _getCommand,
};
