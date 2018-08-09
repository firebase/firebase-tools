"use strict";

var _ = require("lodash");
var clc = require("cli-color");

var Command = require("../lib/command");
var Config = require("../lib/config");
var identifierToProjectId = require("../lib/identifierToProjectId");
var logger = require("../lib/logger");
var prompt = require("../lib/prompt");
var requireAuth = require("../lib/requireAuth");
var utils = require("../lib/utils");

var MOVE_KEYS = {
  rules: "database.rules",
};
Config.LEGACY_HOSTING_KEYS.forEach(function(key) {
  MOVE_KEYS[key] = "hosting." + key;
});

module.exports = new Command("tools:migrate")
  .description("ensure your firebase.json format is up to date")
  .option("-y, --confirm", "pass this option to bypass confirmation prompt")
  .before(requireAuth)
  .action(function(options) {
    if (!options.config) {
      return utils.reject(
        "Must run " + clc.bold("tools:migrate") + " from a directory with a firebase.json"
      );
    }

    utils.logBullet("Checking feature configuration...");
    var out = _.cloneDeep(options.config._src);
    var changed = false;

    _.forEach(MOVE_KEYS, function(dest, src) {
      if (_.has(out, src)) {
        _.set(out, dest, _.get(out, src));
        _.unset(out, src);
        changed = true;
      }
    });

    utils.logBullet('Checking "firebase" key...');
    var instance = out.firebase;
    var rcfile;
    var next;
    var projectId;
    if (instance) {
      next = identifierToProjectId(instance).then(function(result) {
        projectId = result;
        if (projectId) {
          rcfile = { projects: { default: projectId } };
          _.unset(out, "firebase");
        } else {
          return utils.reject(
            "Could not find Firebase project corresponding to " +
              clc.bold(instance) +
              ".\nPlease ensure it has been migrated to the new console before proceeding."
          );
        }
      });
      rcfile = { projects: { default: instance } };

      changed = true;
    } else {
      next = Promise.resolve();
    }

    return next.then(function() {
      if (!changed) {
        logger.info();
        utils.logSuccess("No action required, your firebase.json is all up to date!");
        return true;
      }

      logger.info();
      logger.info(clc.white.bold("# preview: updated contents of firebase.json"));
      logger.info();
      logger.info(JSON.stringify(out, null, 2));
      logger.info();

      if (options.confirm) {
        next = Promise.resolve(true);
      } else {
        next = prompt.once({
          type: "confirm",
          message: "Write new config to " + clc.underline("firebase.json") + "?",
          default: true,
        });
      }

      return next.then(function(confirmed) {
        if (confirmed) {
          options.config.writeProjectFile("firebase.json", out);
          utils.logSuccess("Migrated " + clc.bold("firebase.json") + " successfully");
          if (projectId) {
            options.config.writeProjectFile(".firebaserc", rcfile);
            utils.makeActiveProject(options.projectRoot, projectId);
            utils.logSuccess("Set default project to " + clc.bold(projectId));
          }
        } else {
          return utils.reject("Migration aborted by user.", { exit: 1 });
        }
      });
    });
  });
