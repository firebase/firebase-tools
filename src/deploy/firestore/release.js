"use strict";

var _ = require("lodash");

var FIRESTORE_RELEASE_NAME = "cloud.firestore";

function _releaseRules(context, options) {
  var rulesDeploy = _.get(context, "firestore.rulesDeploy");
  if (!context.firestoreRules || !rulesDeploy) {
    return Promise.resolve();
  }
  return rulesDeploy.release(options.config.get("firestore.rules"), FIRESTORE_RELEASE_NAME);
}

module.exports = function(context, options) {
  return _releaseRules(context, options);
};
