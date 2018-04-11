"use strict";

var _ = require("lodash");
var FirebaseError = require("../lib/error");

module.exports = function(options, validTargets) {
  var targets = validTargets.filter(function(t) {
    return options.config.has(t);
  });
  if (options.only) {
    targets = _.intersection(
      targets,
      options.only.split(",").map(function(opt) {
        return opt.split(":")[0];
      })
    );
  } else if (options.except) {
    targets = _.difference(targets, options.except.split(","));
  }

  if (targets.length === 0) {
    throw new FirebaseError(
      "Cannot understand what targets to deploy. Check that you specified valid targets" +
        " if you used the --only or --except flag. Otherwise, check your firebase.json to" +
        " ensure that your project is initialized for the desired features.",
      { exit: 1 }
    );
  }
  return targets;
};
