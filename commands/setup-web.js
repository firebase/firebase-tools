"use strict";

var fs = require("fs");

var Command = require("../lib/command");
var fetchWebSetup = require("../lib/fetchWebSetup");
var logger = require("../lib/logger");
var requirePermissions = require("../lib/requirePermissions");

var JS_TEMPLATE = fs.readFileSync(__dirname + "/../templates/setup/web.js", "utf8");

module.exports = new Command("setup:web")
  .description("display this project's setup information for the Firebase JS SDK")
  .before(requirePermissions, [])
  .action(function(options) {
    return fetchWebSetup(options).then(function(config) {
      logger.info(JS_TEMPLATE.replace("{/*--CONFIG--*/}", JSON.stringify(config, null, 2)));
      return Promise.resolve(config);
    });
  });
