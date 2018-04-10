"use strict";

var spawn = require("cross-spawn");

var logger = require("../../../logger");
var prompt = require("../../../prompt");

exports.askInstallDependencies = function(setup, config) {
  return prompt(setup.functions, [
    {
      name: "npm",
      type: "confirm",
      message: "Do you want to install dependencies with npm now?",
      default: true,
    },
  ]).then(function() {
    if (setup.functions.npm) {
      return new Promise(function(resolve) {
        var installer = spawn("npm", ["install"], {
          cwd: config.projectDir + "/functions",
          stdio: "inherit",
        });

        installer.on("error", function(err) {
          logger.debug(err.stack);
        });

        installer.on("close", function(code) {
          if (code === 0) {
            return resolve();
          }
          logger.info();
          logger.error("NPM install failed, continuing with Firebase initialization...");
          return resolve();
        });
      });
    }
  });
};
