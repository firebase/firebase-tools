"use strict";

var fs = require("fs");

var Command = require("../command");
var { fetchWebSetup } = require("../fetchWebSetup");
var logger = require("../logger");
var requirePermissions = require("../requirePermissions");

var JS_TEMPLATE = fs.readFileSync(__dirname + "/../../templates/setup/web.js", "utf8");

/**
 * This command is deprecated in favor of `apps:sdkconfig web` command
 * TODO: Remove this command
 */
module.exports = new Command("setup:web")
  .description(
    "[DEPRECATED: use `apps:sdkconfig web`] display this project's setup information for the Firebase JS SDK"
  )
  .before(requirePermissions, [])
  .action(function(options) {
    logger.warn(
      "This command is deprecated. Instead, use 'firebase apps:sdkconfig web' to get web setup information."
    );
    return fetchWebSetup(options).then(function(config) {
      logger.info(JS_TEMPLATE.replace("{/*--CONFIG--*/}", JSON.stringify(config, null, 2)));
      return Promise.resolve(config);
    });
  });
