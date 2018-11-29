"use strict";

var FirebaseError = require("../error");
var fs = require("fs-extra");
var childProcess = require("child_process");
var utils = require("../utils");
var emulatorConstants = require("../emulator/constants");
var logger = require("../logger");

var EMULATOR_INSTANCE_KILL_TIMEOUT = 2000 /* ms */;

function _fatal(emulator, errorMsg) {
  if (emulator.instance) {
    emulator.instance.kill(1);
  }
  throw new FirebaseError(emulator.name + ": " + errorMsg, { exit: 1 });
}

function _runBinary(emulator, command) {
  return new Promise((resolve) => {
    emulator.stdout = fs.createWriteStream(emulator.name + "-debug.log");
    emulator.instance = childProcess.spawn(command.binary, command.args, {
      stdio: ["inherit", "pipe", "pipe"],
    });
    emulator.instance.stdout.on("data", (data) => {
      console.log(data.toString());
      emulator.stdout.write(data.toString());
    });
    emulator.instance.stderr.on("data", (data) => {
      utils.logWarning(emulator.name + ": " + data.toString());
    });
    emulator.instance.on("error", (err) => {
      if (err.path == "java" && err.code == "ENOENT") {
        _fatal(
          emulator,
          "emulator has exited because java is not installed, you can install it from https://openjdk.java.net/install/"
        );
      } else {
        _fatal(emulator, "emulator has exited: " + err);
      }
    });
    emulator.instance.once("exit", (code, signal) => {
      if (signal) {
        utils.logLabeledBullet(
          emulator.name,
          "emulator has exited upon receiving signal: " + signal
        );
      } else if (code && code !== 0 && code !== /* SIGINT */ 130) {
        _fatal(emulator, "emulator has exited with code: " + code);
      } else {
        utils.logLabeledBullet(emulator.name, "emulator has exited");
      }
    });
    utils.logLabeledSuccess(emulator.name, "started on http://localhost:" + emulator.port);
    resolve();
  });
}

function _stop(targetName) {
  var emulator = emulatorConstants.emulators[targetName];
  return new Promise(function(resolve, reject) {
    utils.logLabeledSuccess(emulator.name, "shutting down");
    if (emulator.instance) {
      var killTimeout = setTimeout(function() {
        var errorMsg =
          emulator.name +
          ": Unable to terminate emulator process (PID=" +
          emulator.instance.pid +
          ")";
        logger.debug(errorMsg);
        console.warn(errorMsg);
        reject(new FirebaseError(emulator.name + ": " + errorMsg));
      }, EMULATOR_INSTANCE_KILL_TIMEOUT);
      emulator.instance.once("exit", function() {
        clearTimeout(killTimeout);
        resolve();
      });
      emulator.instance.kill("SIGINT");
    } else {
      resolve();
    }
  });
}

function _start(targetName) {
  var emulator = emulatorConstants.emulators[targetName];
  var command = emulatorConstants.commands[targetName];
  if (!fs.existsSync(emulator.localPath)) {
    utils.logWarning("Setup required, please run: firebase setup:emulators:" + emulator.name);
    return Promise.reject("emulator not found");
  }
  return _runBinary(emulator, command);
}

module.exports = {
  start: _start,
  stop: _stop,
};
