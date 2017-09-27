'use strict';

var chalk = require('chalk');
var fs = require('fs');
var RSVP = require('rsvp');

var gcp = require('../../gcp');
var utils = require('../../utils');

module.exports = function(context, options) {
  var rulesPath = options.config.get('storage.rules');
  if (rulesPath) {
    rulesPath = options.config.path(rulesPath);
    var src = fs.readFileSync(rulesPath, 'utf8');
    var files = [{name: options.config.get('storage.rules'), content: src}];

    utils.logBullet(chalk.bold.cyan('storage:') + ' checking rules for compilation errors...');
    return gcp.rules.testRuleset(options.project, files).then(function(response) {
      if (response.body && response.body.issues && response.body.issues.length > 0) {
        var add = response.body.issues.length === 1 ? '' : 's';
        var message = 'Compilation error' + add + ' in ' + chalk.bold(options.config.get('storage.rules')) + ':\n';
        response.body.issues.forEach(function(issue) {
          message += '\n[' + issue.severity.substring(0, 1) + '] ' + issue.sourcePosition.line + ':' + issue.sourcePosition.column + ' - ' + issue.description;
        });

        return utils.reject(message, {exit: 1});
      }

      utils.logSuccess(chalk.bold.green('storage:') + ' rules file compiled successfully');
      context.storage = {rules: files};
      return RSVP.resolve();
    });
  }

  return RSVP.resolve();
};
