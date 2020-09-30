"use strict";

var { Command } = require("../command");
var requireInstance = require("../requireInstance");
var { requirePermissions } = require("../requirePermissions");
var DatabaseRemove = require("../database/remove").default;
var { Emulators } = require("../emulator/types");
var { warnEmulatorNotSupported } = require("../emulator/commandUtils");
var { populateInstanceDetails } = require("../management/database");
var { realtimeOriginOrEmulatorOrCustomUrl } = require("../database/api");
var utils = require("../utils");
var { prompt } = require("../prompt");
var clc = require("cli-color");
var _ = require("lodash");

module.exports = new Command("database:remove <path>")
  .description("remove data from your Firebase at the specified path")
  .option("-y, --confirm", "pass this option to bypass confirmation prompt")
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, use default database instance)"
  )
  .before(requirePermissions, ["firebasedatabase.instances.update"])
  .before(requireInstance)
  .before(populateInstanceDetails)
  .before(warnEmulatorNotSupported, Emulators.DATABASE)
  .action(function(path, options) {
    if (!_.startsWith(path, "/")) {
      return utils.reject("Path must begin with /", { exit: 1 });
    }
    const origin = realtimeOriginOrEmulatorOrCustomUrl(options);
    // logger.debug("Remove URL: ", typeof(origin));
    const databaseUrl = utils.getDatabaseUrl(origin, options.instance, path);

    return prompt(options, [
      {
        type: "confirm",
        name: "confirm",
        default: false,
        message: "You are about to remove all data at " + clc.cyan(databaseUrl) + ". Are you sure?",
      },
    ]).then(function() {
      if (!options.confirm) {
        return utils.reject("Command aborted.", { exit: 1 });
      }

      var removeOps = new DatabaseRemove(options.instance, path, origin);
      return removeOps.execute().then(function() {
        utils.logSuccess("Data removed successfully");
      });
    });
  });
