'use strict';

var _ = require('lodash');
var RSVP = require('rsvp');

var STORAGE_RELEASE_NAME = 'firebase.storage';

module.exports = function(context, options) {
  var rules = _.get(context, 'storage.rules', []);
  var rulesDeploy = _.get(context, 'storage.rulesDeploy');
  if (!rules.length || !rulesDeploy) {
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
    return rulesDeploy.release(release.rules, [STORAGE_RELEASE_NAME, release.bucket].join('/'));
  }));
};
