"use strict";

var _ = require("lodash");
var clc = require("cli-color");
var path = require("path");

var { FirebaseError } = require("../../error");
var parseBoltRules = require("../../parseBoltRules");
var rtdb = require("../../rtdb");
var utils = require("../../utils");

const dbRulesConfig = require("../../database/rulesConfig");

module.exports = function(context, options) {
  var rulesConfig = dbRulesConfig.getRulesConfig(context.projectId, options);
  var next = Promise.resolve();

  if (!rulesConfig || rulesConfig.length === 0) {
    return next;
  }

  var ruleFiles = {};
  var deploys = [];

  rulesConfig.forEach(function(ruleConfig) {
    if (!ruleConfig.rules) {
      return;
    }

    ruleFiles[ruleConfig.rules] = null;
    deploys.push(ruleConfig);
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
        .updateRules(context.projectId, deploy.instance, ruleFiles[deploy.rules], { dryRun: true })
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
