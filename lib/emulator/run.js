"use strict";

var _ = require("lodash");
var FirebaseError = require("../error");
var fs = require("fs");
var subprocess = require("child_process");
var utils = require("../utils");
var logger = require("../logger");
var request = require("request");
var mkdirp = require("mkdirp");

const REMOTE_ROOT_URL = "https://storage.googleapis.com/ryanpbrewster-test/emulators";
const CACHE_DIR = process.env.HOME + "/.cache/firebase/emulators";
function emulatorPath(emulator) {
  return CACHE_DIR + "/" + emulator.name;
}
const emulators = {
  database: {
    instance: null,
    name: "firebase-database-emulator-v3.5.0.jar",
    port: 9000,
    remote:
      REMOTE_ROOT_URL + "/database/firebase-database-emulator-v3.5.0.jar",
    stdout: null,
  },
  firestore: {
    instance: null,
    name: "cloud-firestore-emulator-v1.2.0.jar",
    port: 8080,
    remote:
      REMOTE_ROOT_URL + "/firestore/cloud-firestore-emulator-v1.2.0.jar",
    stdout: null,
  },
};

const commands = {
  database: {
    binary: "java",
    args: ["-jar", emulatorPath(emulators["database"]), "--port", emulators["database"].port],
  },
  firestore: {
    binary: "java",
    args: ["-jar", emulatorPath(emulators["firestore"]), "--port", emulators["firestore"].port],
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
      const path = emulatorPath(emulator);
      if (fs.existsSync(emulatorPath)) {
        return Promise.resolve();
      }
      utils.logLabeledBullet(targetName, "fetching emulator");
      return new Promise((resolve, reject) => {
        // Make sure the CACHE_DIR exists
        mkdirp(CACHE_DIR);
        var req = request.get(emulator.remote);
        var writeStream = fs.createWriteStream(path);
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
