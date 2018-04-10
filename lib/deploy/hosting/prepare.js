"use strict";

var _ = require("lodash");

var resolveProjectPath = require("../../resolveProjectPath");
var fsutils = require("../../fsutils");
var utils = require("../../utils");

module.exports = function(context, options, payload) {
  context.hosting = {
    // TODO: Get Firebase subdomain - not always the same as the projectId
    versionRef: options.firebaseRef
      .child("hosting/versions")
      .child(options.instance)
      .push(),
  };
  context.hosting.versionId = context.hosting.versionRef.key();

  // Allow the public directory to be overridden by the --public flag
  if (options.public) {
    // trigger legacy key import since public may not exist in firebase.json
    options.config.importLegacyHostingKeys();
    options.config.set("hosting.public", options.public);
  }

  payload.hosting = options.config.get("hosting");

  if (payload.hosting) {
    if (!_.has(payload, "hosting.public")) {
      return utils.reject("No public directory specified, can't deploy hosting", { exit: 1 });
    } else if (!fsutils.dirExistsSync(resolveProjectPath(options.cwd, payload.hosting.public))) {
      return utils.reject("Specified public directory does not exist, can't deploy hosting", {
        exit: 1,
      });
    }
  }

  return Promise.resolve();
};
