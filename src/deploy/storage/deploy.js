"use strict";

var _ = require("lodash");

module.exports = function(context) {
  var rulesDeploy = _.get(context, "storage.rulesDeploy");
  if (!rulesDeploy) {
    return Promise.resolve();
  }

  return rulesDeploy.createRulesets();
};
