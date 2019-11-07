"use strict";

const _ = require("lodash");

const { RulesetServiceType } = require("../../RulesDeploy");

module.exports = function(context) {
  const rulesDeploy = _.get(context, "storage.rulesDeploy");
  if (!rulesDeploy) {
    return Promise.resolve();
  }

  return rulesDeploy.createRulesets(RulesetServiceType.FIREBASE_STORAGE);
};
