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
    localPath: path.join(CACHE_DIR, "firebase-database-emulator-v3.5.0.jar"),
  },
  firestore: {
    name: "firestore",
    instance: null,
    port: 8080,
    stdout: null,
    cacheDir: CACHE_DIR,
    remoteUrl:
      "https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.2.0.jar",
    localPath: path.join(CACHE_DIR, "cloud-firestore-emulator-v1.2.0.jar"),
  },
};

const _commands = {
  database: {
    binary: "java",
    args: [
      "-Duser.language=en",
      "-jar",
      _emulators.database.localPath,
      "--port",
      _emulators.database.port,
    ],
  },
  firestore: {
    binary: "java",
    args: [
      "-Duser.language=en",
      "-jar",
      _emulators.firestore.localPath,
      "--port",
      _emulators.firestore.port,
    ],
  },
};

module.exports = {
  emulators: _emulators,
  commands: _commands,
};
