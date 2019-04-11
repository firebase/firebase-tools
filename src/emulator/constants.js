"use strict";

var userHome = require("user-home");
var path = require("path");

const CACHE_DIR =
  process.env.FIREBASE_EMULATORS_PATH || path.join(userHome, ".cache", "firebase", "emulators");

const DEFAULT_PORTS = {
  database: 9000,
  firestore: 8080,
  functions: 8088,
};

const _emulators = {
  database: {
    name: "database",
    instance: null,
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
    stdout: null,
    cacheDir: CACHE_DIR,
    remoteUrl:
      "https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.4.4.jar",
    expectedSize: 56904597,
    expectedChecksum: "b64aa203304f231b61ad7c30316d1094",
    localPath: path.join(CACHE_DIR, "cloud-firestore-emulator-v1.4.4.jar"),
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

function _getDefaultPort(emulator) {
  return DEFAULT_PORTS[emulator];
}

/**
 * Get a command to start the an emulator.
 * @param emulator - string identifier for the emulator to start.
 * @param args - map<string,string> of addittional args
 */
function _getCommand(emulator, args) {
  var baseCmd = _commands[emulator];

  var defaultPort = DEFAULT_PORTS[emulator];
  if (!args["port"]) {
    args["port"] = defaultPort;
  }

  var cmdLineArgs = baseCmd.args.slice();
  Object.keys(args).forEach((key) => {
    var argKey = "--" + key;
    var argVal = args[key];

    cmdLineArgs.push(argKey, argVal);
  });

  return {
    binary: baseCmd.binary,
    args: cmdLineArgs,
  };
}

module.exports = {
  emulators: _emulators,
  commands: _commands,
  getCommand: _getCommand,
  getDefaultPort: _getDefaultPort,
};
