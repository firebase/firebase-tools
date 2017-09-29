'use strict';

var _ = require('lodash');
var chalk = require('chalk');
var fs = require('fs');
var RSVP = require('rsvp');

var gcp = require('../../gcp');
var utils = require('../../utils');

module.exports = function(context, options) {
  function _compileRules(filename, rules) {
    utils.logBullet(chalk.bold.cyan('storage:') + ' checking ' + chalk.bold(filename) + ' for compilation errors...');
    return gcp.rules.testRuleset(options.project, rules.files).then(function(response) {
      if (response.body && response.body.issues && response.body.issues.length > 0) {
        var add = response.body.issues.length === 1 ? '' : 's';
        var message = 'Compilation error' + add + ' in ' + chalk.bold(filename) + ':\n';
        response.body.issues.forEach(function(issue) {
          message += '\n[' + issue.severity.substring(0, 1) + '] ' + issue.sourcePosition.line + ':' + issue.sourcePosition.column + ' - ' + issue.description;
        });

        return utils.reject(message, {exit: 1});
      }

      utils.logSuccess(chalk.bold.green('storage:') + ' rules file ' + chalk.bold(filename) + ' compiled successfully');
      return RSVP.resolve();
    });
  }

  var rulesConfig = options.config.get('storage');
  _.set(context, 'storage.rules', rulesConfig);

  var next = RSVP.resolve();

  if (!rulesConfig) {
    return next;
  }

  if (_.isPlainObject(rulesConfig)) {
    next = gcp.storage.buckets.getDefault(options.project).then(function(defaultBucket) {
      rulesConfig = [_.assign(rulesConfig, {bucket: defaultBucket})];
      _.set(context, 'storage.rules', rulesConfig);
    });
  }

  return next.then(function() {
    rulesConfig.forEach(function(ruleConfig) {
      if (ruleConfig.target) {
        options.rc.requireTarget(context.projectId, 'storage', ruleConfig.target);
      }
    });

    context.storage.rulesMap = rulesConfig.reduce(function(m, config) {
      if (!config.rules) { return m; }
      var rulesPath = options.config.path(config.rules);
      var src = fs.readFileSync(rulesPath, 'utf8');
      m[config.rules] = {files: [{name: config.rules, content: src}]};
      return m;
    }, {});

    var promises = [];
    _.forEach(context.storage.rulesMap, function(files, filename) {
      promises.push(_compileRules(filename, files));
    });
    return RSVP.all(promises);
  });
};
