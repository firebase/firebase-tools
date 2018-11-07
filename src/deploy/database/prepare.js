"use strict";

var _ = require("lodash");
var clc = require("cli-color");
var path = require("path");

var FirebaseError = require("../../error");
var parseBoltRules = require("../../parseBoltRules");
var rtdb = require("../../rtdb");
var utils = require("../../utils");

module.exports = function(context, options) {
  var rulesConfig = options.config.get("database");
  var next = Promise.resolve();

  if (!rulesConfig) {
    return next;
  }

  if (_.isString(_.get(rulesConfig, "rules"))) {
    rulesConfig = [_.assign(rulesConfig, { instance: options.instance })];
  }

  var ruleFiles = {};
  var deploys = [];

  rulesConfig.forEach(function(ruleConfig) {
    if (!ruleConfig.rules) {
      return;
    }

    ruleFiles[ruleConfig.rules] = null;

    if (ruleConfig.target) {
      options.rc.requireTarget(context.projectId, "database", ruleConfig.target);
      var instances = options.rc.target(context.projectId, "database", ruleConfig.target);
      deploys = deploys.concat(
        instances.map(function(inst) {
          return { instance: inst, rules: ruleConfig.rules };
        })
      );
    } else if (!ruleConfig.instance) {
      throw new FirebaseError('Must supply either "target" or "instance" in database config');
    } else {
      deploys.push(ruleConfig);
    }
  });

  _.forEach(ruleFiles, function(v, file) {
    switch (path.extname(file)) {
      case ".json":
        ruleFiles[file] = options.config.readProjectFile(file);
        break;
      case ".bolt":
        ruleFiles[file] = parseBoltRules(file);
        break;
      default:
        throw new FirebaseError("Unexpected rules format " + path.extname(file));
    }
  });

  context.database = {
    deploys: deploys,
    ruleFiles: ruleFiles,
  };
  utils.logBullet(clc.bold.cyan("database: ") + "checking rules syntax...");
  return Promise.all(
    deploys.map(function(deploy) {
      return rtdb
        .updateRules(deploy.instance, ruleFiles[deploy.rules], { dryRun: true })
        .then(function() {
          utils.logSuccess(
            clc.bold.green("database: ") +
              "rules syntax for database " +
              clc.bold(deploy.instance) +
              " is valid"
          );
        });
    })
  );
};
