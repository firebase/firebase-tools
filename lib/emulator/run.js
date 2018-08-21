"use strict";

var _ = require("lodash");
var FirebaseError = require("../error");
var fs = require("fs");
var subprocess = require("child_process");
var utils = require("../utils");
var logger = require("../logger");
var request = require("request");

var emulators = {
  database: {
    instance: null,
    path:
      "/usr/local/google/home/tonymeng/Downloads/emulators/firebase-database-emulator-v3.4.0.jar",
    port: 9000,
    remote:
      "https://storage.googleapis.com/ryanpbrewster-test/emulators/database/firebase-database-emulator-v3.4.0.jar",
    stdout: null,
  },
  firestore: {
    instance: null,
    path: "/usr/local/google/home/tonymeng/Downloads/emulators/cloud-firestore-emulator-v1.1.0.jar",
    port: 8080,
    remote:
      "https://storage.googleapis.com/ryanpbrewster-test/emulators/firestore/cloud-firestore-emulator-v1.1.0.jar",
    stdout: null,
  },
};

var commands = {
  database: {
    binary: "java",
    args: ["-jar", emulators["database"].path, "--port", emulators["database"].port],
  },
  firestore: {
    binary: "java",
    args: ["-jar", emulators["firestore"].path, "--port", emulators["firestore"].port],
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
      if (fs.existsSync(emulator.path)) {
        return Promise.resolve();
      }
      utils.logLabeledBullet(targetName, "fetching emulator");
      return new Promise((resolve, reject) => {
        var req = request.get(emulator.remote);
        var writeStream = fs.createWriteStream(emulator.path);
        req.on("error", err => reject(err));
        req.on("end", () => {
          writeStream.close();
          resolve();
        });
        req.pipe(writeStream);
      });
    })
  )
    .then(() => {
      return Promise.all(
        _.map(targetNames, targetName => {
          var emulator = emulators[targetName];
          emulator.stdout = fs.createWriteStream(targetName + "-debug.log");
          emulator.instance = subprocess.spawn(
            commands[targetName].binary,
            commands[targetName].args,
            {
              stdio: ["inherit", "pipe", "pipe"],
            }
          );
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
      );
    })
    .then(() => {
      return new Promise(resolve => {
        process.on("SIGINT", () => {
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
