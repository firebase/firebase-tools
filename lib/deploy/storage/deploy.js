'use strict';

var _ = require('lodash');
var RSVP = require('rsvp');

var gcp = require('../../gcp');
var utils = require('../../utils');

module.exports = function(context, options) {
  var files = _.get(context, 'storage.rules');
  if (!files) {
    return RSVP.resolve();
  }

  return gcp.storage.buckets.getDefault(options.project).then(function(defaultBucket) {
    if (!defaultBucket) {
      return utils.reject('Unable to locate your default bucket. Please visit the storage panel in the Firebase console to ensure provisioning.');
    }

    context.storage.defaultBucket = defaultBucket;
    return gcp.rules.createRuleset(options.project, files);
  }).then(function(rulesetName) {
    context.storage.rulesetName = rulesetName;
  });
};
