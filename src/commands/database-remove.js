"use strict";

var Command = require("../command");
var requireInstance = require("../requireInstance");
var requirePermissions = require("../requirePermissions");
var DatabaseRemove = require("../database/remove");
var api = require("../api");
var FirebaseError = require("../error");

var utils = require("../utils");
var prompt = require("../prompt");
var clc = require("cli-color");
var _ = require("lodash");

module.exports = new Command("database:remove <path>")
  .description("remove data from your Firebase at the specified path")
  .option("-y, --confirm", "pass this option to bypass confirmation prompt")
  .option("-v, --verbose", "show delete progress (helpful for large delete)")
  .option(
    "-c, --concurrency <num>",
    "default=500. configure the concurrency threshold. 10000 maximum"
  )
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, use default database instance)"
  )
  .before(requirePermissions, ["firebasedatabase.instances.update"])
  .before(requireInstance)
  .action(function(path, options) {
    if (!_.startsWith(path, "/")) {
      return reject(new FirebaseError("Path must begin with /", { exit: 1 }));
    }
    return prompt(options, [
      {
        type: "confirm",
        name: "confirm",
        default: false,
        message:
          "You are about to remove all data at " +
          clc.cyan(utils.addSubdomain(api.realtimeOrigin, options.instance) + path) +
          ". Are you sure?",
      },
    ]).then(function() {
      if (!options.confirm) {
        return reject(new FirebaseError("Command aborted.", { exit: 1 }));
      }
      options.concurrency = options.concurrency || 500;
      if (options.concurrency > 10000) {
        return reject(
          new FirebaseError("Please specify a concurrency factor from 0 to 10000.", { exit: 1 })
        );
      }
      var removeOps = new DatabaseRemove(options.instance, path, {
        concurrency: options.concurrency,
        verbose: options.verbose,
      });
      return removeOps.execute().then(function() {
        utils.logSuccess("Data removed successfully");
      });
    });
  });
