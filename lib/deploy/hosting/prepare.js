"use strict";

const api = require("../../api");
const convertConfig = require("./convertConfig");
const fsutils = require("../../fsutils");
const resolveProjectPath = require("../../resolveProjectPath");
const utils = require("../../utils");

module.exports = function(context, options) {
  // Allow the public directory to be overridden by the --public flag
  if (options.public) {
    // trigger legacy key import since public may not exist in firebase.json
    options.config.importLegacyHostingKeys();
    options.config.set("hosting.public", options.public);
  }

  if (!options.config.get("hosting")) {
    return Promise.resolve();
  }

  if (
    !fsutils.dirExistsSync(resolveProjectPath(options.cwd, options.config.get("hosting.public")))
  ) {
    return utils.reject("Specified public directory does not exist, can't deploy hosting", {
      exit: 1,
    });
  }

  return api
    .request("POST", "/v1beta1/sites/" + options.instance + "/versions", {
      origin: api.hostingApiOrigin,
      auth: true,
      data: {
        config: convertConfig(options.config.get("hosting")),
      },
    })
    .then(function(result) {
      context.hosting = { version: result.body.name };
    });
};
