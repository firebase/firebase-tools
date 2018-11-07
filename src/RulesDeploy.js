"use strict";

var _ = require("lodash");
var clc = require("cli-color");
var fs = require("fs");

var gcp = require("./gcp");
var logger = require("./logger");
var FirebaseError = require("./error");
var utils = require("./utils");

function RulesDeploy(options, type) {
  this.type = type;
  this.options = options;
  this.project = options.project;
  this.rulesFiles = {};
  this.rulesetNames = {};
}

RulesDeploy.prototype = {
  /**
   * Adds a new project-relative file to be included in compilation and
   * deployment for this RulesDeploy.
   */
  addFile: function(path) {
    var fullPath = this.options.config.path(path);
    var src;
    try {
      src = fs.readFileSync(fullPath, "utf8");
    } catch (e) {
      logger.debug("[rules read error]", e.stack);
      throw new FirebaseError("Error reading rules file " + clc.bold(path));
    }

    this.rulesFiles[path] = [{ name: path, content: src }];
  },

  /**
   * Compile all rulesets tied to this deploy, rejecting on first
   * compilation error.
   */
  compile: function() {
    var self = this;
    var promises = [];
    _.forEach(this.rulesFiles, function(files, filename) {
      promises.push(self._compileRuleset(filename, files));
    });
    return Promise.all(promises);
  },

  /**
   * Create rulesets for each file added to this deploy, and record
   * the name for use in the release process later.
   */
  createRulesets: function() {
    var self = this;
    var promises = [];
    _.forEach(this.rulesFiles, function(files, filename) {
      utils.logBullet(
        clc.bold.cyan(self.type + ":") + " uploading rules " + clc.bold(filename) + "..."
      );
      promises.push(
        gcp.rules.createRuleset(self.options.project, files).then(function(rulesetName) {
          self.rulesetNames[filename] = rulesetName;
        })
      );
    });
    return Promise.all(promises);
  },

  release: function(filename, resourceName) {
    var self = this;
    return gcp.rules
      .updateOrCreateRelease(this.options.project, this.rulesetNames[filename], resourceName)
      .then(function() {
        utils.logSuccess(
          clc.bold.green(self.type + ": ") +
            "released rules " +
            clc.bold(filename) +
            " to " +
            clc.bold(resourceName)
        );
      });
  },

  _compileRuleset: function(filename, files) {
    utils.logBullet(
      clc.bold.cyan(this.type + ":") +
        " checking " +
        clc.bold(filename) +
        " for compilation errors..."
    );
    var self = this;
    return gcp.rules.testRuleset(self.options.project, files).then(function(response) {
      if (response.body && response.body.issues && response.body.issues.length > 0) {
        var warnings = [];
        var errors = [];
        response.body.issues.forEach(function(issue) {
          var issueMessage =
            "[" +
            issue.severity.substring(0, 1) +
            "] " +
            issue.sourcePosition.line +
            ":" +
            issue.sourcePosition.column +
            " - " +
            issue.description;

          if (issue.severity === "ERROR") {
            errors.push(issueMessage);
          } else {
            warnings.push(issueMessage);
          }
        });

        if (warnings.length > 0) {
          warnings.forEach(function(warning) {
            utils.logWarning(warning);
          });
        }

        if (errors.length > 0) {
          var add = errors.length === 1 ? "" : "s";
          var message =
            "Compilation error" + add + " in " + clc.bold(filename) + ":\n" + errors.join("\n");
          return utils.reject(message, { exit: 1 });
        }
      }

      utils.logSuccess(
        clc.bold.green(self.type + ":") +
          " rules file " +
          clc.bold(filename) +
          " compiled successfully"
      );
      return Promise.resolve();
    });
  },
};

module.exports = RulesDeploy;
