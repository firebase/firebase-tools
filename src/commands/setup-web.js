"use strict";

var fs = require("fs");

var Command = require("../command");
var fetchWebSetup = require("../fetchWebSetup");
var logger = require("../logger");
var requirePermissions = require("../requirePermissions");

var JS_TEMPLATE = fs.readFileSync(__dirname + "/../../templates/setup/web.js", "utf8");

module.exports = new Command("setup:web")
  .description("display this project's setup information for the Firebase JS SDK")
  .before(requirePermissions, [])
  .action(function(options) {
    return fetchWebSetup(options).then(function(config) {
      logger.info(JS_TEMPLATE.replace("{/*--CONFIG--*/}", JSON.stringify(config, null, 2)));
      return Promise.resolve(config);
    });
  });
