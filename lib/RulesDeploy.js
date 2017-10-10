'use strict';

var _ = require('lodash');
var chalk = require('chalk');
var fs = require('fs');
var RSVP = require('rsvp');

var gcp = require('./gcp');
var logger = require('./logger');
var FirebaseError = require('./error');
var utils = require('./utils');

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
      src = fs.readFileSync(fullPath, 'utf8');
    } catch (e) {
      logger.debug('[rules read error]', e.stack);
      throw new FirebaseError('Error reading rules file ' + chalk.bold(path));
    }

    this.rulesFiles[path] = [{name: path, content: src}];
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
    return RSVP.all(promises);
  },

  /**
   * Create rulesets for each file added to this deploy, and record
   * the name for use in the release process later.
   */
  createRulesets: function() {
    var self = this;
    var promises = [];
    _.forEach(this.rulesFiles, function(files, filename) {
      utils.logBullet(chalk.cyan(self.type + ':') + ' uploading rules ' + chalk.bold(filename) + '...');
      promises.push(gcp.rules.createRuleset(self.options.project, files).then(function(rulesetName) {
        self.rulesetNames[filename] = rulesetName;
      }));
    });
    return RSVP.all(promises);
  },

  release: function(filename, resourceName) {
    var self = this;
    return gcp.rules.updateOrCreateRelease(
      this.options.project,
      this.rulesetNames[filename],
      resourceName
    ).then(function() {
      utils.logSuccess(chalk.bold.green(self.type + ': ') + 'released rules ' + chalk.bold(filename) + ' to ' + chalk.bold(resourceName));
    });
  },

  _compileRuleset: function(filename, files) {
    utils.logBullet(chalk.bold.cyan(this.type + ':') + ' checking ' + chalk.bold(filename) + ' for compilation errors...');
    var self = this;
    return gcp.rules.testRuleset(self.options.project, files).then(function(response) {
      if (response.body && response.body.issues && response.body.issues.length > 0) {
        var add = response.body.issues.length === 1 ? '' : 's';
        var message = 'Compilation error' + add + ' in ' + chalk.bold(filename) + ':\n';
        response.body.issues.forEach(function(issue) {
          message += '\n[' + issue.severity.substring(0, 1) + '] ' + issue.sourcePosition.line + ':' + issue.sourcePosition.column + ' - ' + issue.description;
        });

        return utils.reject(message, {exit: 1});
      }

      utils.logSuccess(chalk.bold.green(self.type + ':') + ' rules file ' + chalk.bold(filename) + ' compiled successfully');
      return RSVP.resolve();
    });
  }
};

module.exports = RulesDeploy;
