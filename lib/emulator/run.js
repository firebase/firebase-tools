"use strict";

var _ = require("lodash");
var FirebaseError = require("../error");
var fs = require("fs");
var subprocess = require("child_process");
var utils = require("../utils");
var logger = require("../logger");

var emulators = {
  database: {
    command: {
      binary: "java",
      args: [
        "-jar",
        "/usr/local/google/home/tonymeng/Downloads/emulators/database-emulator-v3.2.0.jar",
        "--port",
        9000,
      ],
    },
    instance: null,
    path: "/usr/local/google/home/tonymeng/Downloads/emulators/database-emulator-v3.2.0.jar",
    port: 9000,
    stdout: null,
  },
  firestore: {
    command: {
      binary: "java",
      args: [
        "-jar",
        "/usr/local/google/home/tonymeng/Downloads/emulators/firestore-emulator-v0.0.0.jar",
        "--port",
        8080,
      ],
    },
    instance: null,
    path: "/usr/local/google/home/tonymeng/Downloads/emulators/firestore-emulator-v0.0.0.jar",
    port: 8080,
    stdout: null,
  },
};

var error = function(targetName, errorMsg) {
  var emulator = emulators[targetName];
  if (emulator.instance) {
    emulator.instance.kill(1);
  }
  throw new FirebaseError(targetName + ": " + errorMsg, { exit: 1 });
};

var _emulator = function(options) {
  var targetNames = options.targets;
  options.port = parseInt(options.port, 10);
  return Promise.all(
    _.map(targetNames, targetName => {
      var emulator = emulators[targetName];
      if (!fs.existsSync(emulator.path)) {
        error(targetName, "emulator not found (have you run prodaccess?): " + emulator.path);
      }
      emulator.stdout = fs.createWriteStream(targetName + "-debug.log");
      emulator.instance = subprocess.spawn(emulator.command.binary, emulator.command.args, {
        stdio: ["inherit", "pipe", "pipe"],
      });
      emulator.instance.stdout.on("data", data => {
        console.log(data.toString());
        emulator.stdout.write(data.toString());
      });

      emulator.instance.stderr.on("data", data => {
        utils.logWarning(targetName + ": " + data.toString());
      });

      emulator.instance.once("exit", (code, signal) => {
        if (signal) {
          utils.logLabeledBullet(
            targetName,
            "emulator has excited upon receiving signal: " + signal
          );
        } else if (code && code !== 0 && code !== /* SIGINT */ 130) {
          error(targetName, "emulator has exited with code: " + code);
        } else {
          utils.logLabeledBullet(targetName, "emulator has exited");
        }
      });
      utils.logLabeledSuccess(targetName, "started on http://localhost:" + emulator.port);
      return Promise.resolve();
    })
  ).then(function() {
    return new Promise(resolve => {
      process.on("SIGINT", function() {
        logger.info("Shutting down...");
        return Promise.all(
          _.forEach(targetNames, targetName => {
            var emulator = emulators[targetName];
            if (emulator.instance) {
              utils.logLabeledSuccess(targetName, "shutting down");
              return emulator.instance.kill(0);
            }
            return Promise.resolve();
          })
        )
          .then(resolve)
          .catch(resolve);
      });
    });
  });
};

module.exports = _emulator;
