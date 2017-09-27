'use strict';

var _ = require('lodash');
var chalk = require('chalk');
var RSVP = require('rsvp');

var gcp = require('../../gcp');
var utils = require('../../utils');

module.exports = function(context, options) {
  var rulesMap = _.get(context, 'storage.rulesMap');
  if (!rulesMap) {
    return RSVP.resolve();
  }

  var promises = [];
  _.forEach(rulesMap, function(rules, filename) {
    utils.logBullet(chalk.cyan('storage:') + ' uploading rules ' + chalk.bold(filename) + '...');
    promises.push(gcp.rules.createRuleset(options.project, rules.files).then(function(rulesetName) {
      rules.ruleset = rulesetName;
    }));
  });

  return RSVP.all(promises);
};
