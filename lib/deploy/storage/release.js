'use strict';

var _ = require('lodash');
var chalk = require('chalk');
var RSVP = require('rsvp');

var gcp = require('../../gcp');
var utils = require('../../utils');

var STORAGE_RELEASE_NAME = 'firebase.storage';

module.exports = function(context, options) {
  var rules = _.get(context, 'storage.rules', []);
  if (!rules.length) {
    return RSVP.resolve();
  }

  var toRelease = [];
  rules.forEach(function(ruleConfig) {
    if (ruleConfig.target) {
      options.rc.target(options.project, 'storage', ruleConfig.target).forEach(function(bucket) {
        toRelease.push({bucket: bucket, rules: ruleConfig.rules});
      });
    } else {
      toRelease.push({bucket: ruleConfig.bucket, rules: ruleConfig.rules});
    }
  });

  return RSVP.all(toRelease.map(function(release) {
    return gcp.rules.updateOrCreateRelease(
      options.project,
      _.get(context, ['storage', 'rulesMap', release.rules, 'ruleset']),
      [STORAGE_RELEASE_NAME, release.bucket].join('/')
    ).then(function() {
      utils.logSuccess(chalk.bold.green('storage: ') + 'released rules ' + chalk.bold(release.rules) + ' to ' + chalk.bold(release.bucket));
    })
  }));
};
