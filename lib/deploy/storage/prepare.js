"use strict";

var _ = require("lodash");

var gcp = require("../../gcp");
var RulesDeploy = require("../../RulesDeploy");

module.exports = function(context, options) {
  var rulesConfig = options.config.get("storage");
  var next = Promise.resolve();

  if (!rulesConfig) {
    return next;
  }

  _.set(context, "storage.rules", rulesConfig);

  var rulesDeploy = new RulesDeploy(options, "storage");
  _.set(context, "storage.rulesDeploy", rulesDeploy);

  if (_.isPlainObject(rulesConfig)) {
    next = gcp.storage.getDefaultBucket(options.project).then(function(defaultBucket) {
      rulesConfig = [_.assign(rulesConfig, { bucket: defaultBucket })];
      _.set(context, "storage.rules", rulesConfig);
    });
  }

  return next.then(function() {
    rulesConfig.forEach(function(ruleConfig) {
      if (ruleConfig.target) {
        options.rc.requireTarget(context.projectId, "storage", ruleConfig.target);
      }

      rulesDeploy.addFile(ruleConfig.rules);
    });

    return rulesDeploy.compile();
  });
};
