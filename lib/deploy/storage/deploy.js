'use strict';

var _ = require('lodash');
var RSVP = require('rsvp');

module.exports = function(context) {
  var rulesDeploy = _.get(context, 'storage.rulesDeploy');
  if (!rulesDeploy) {
    return RSVP.resolve();
  }

  return rulesDeploy.createRulesets();
};
