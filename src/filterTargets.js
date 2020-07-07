"use strict";

var _ = require("lodash");
var { FirebaseError } = require("./error");

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
    let msg = "Cannot understand what targets to deploy/serve.";

    if (options.only) {
      msg += ` No targets in firebase.json match '--only ${options.only}'.`;
    } else if (options.except) {
      msg += ` No targets in firebase.json match '--except ${options.except}'.`;
    }

    if (process.platform === "win32") {
      msg +=
        ' If you are using PowerShell make sure you place quotes around any comma-separated lists (ex: --only "functions,firestore").';
    }

    throw new FirebaseError(msg, { exit: 1 });
  }
  return targets;
};
