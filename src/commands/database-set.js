"use strict";

var { Command } = require("../command");
var requireInstance = require("../requireInstance");
var { requirePermissions } = require("../requirePermissions");
var request = require("request");
var api = require("../api");
var responseToError = require("../responseToError");
var { FirebaseError } = require("../error");
var { Emulators } = require("../emulator/types");
var { printNoticeIfEmulated } = require("../emulator/commandUtils");

var utils = require("../utils");
var clc = require("cli-color");
var logger = require("../logger");
var fs = require("fs");
var { prompt } = require("../prompt");
var _ = require("lodash");

module.exports = new Command("database:set <path> [infile]")
  .description("store JSON data at the specified path via STDIN, arg, or file")
  .option("-d, --data <data>", "specify escaped JSON directly")
  .option("-y, --confirm", "pass this option to bypass confirmation prompt")
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, use default database instance)"
  )
  .before(requirePermissions, ["firebasedatabase.instances.update"])
  .before(requireInstance)
  .before(printNoticeIfEmulated, Emulators.DATABASE)
  .action(function(path, infile, options) {
    if (!_.startsWith(path, "/")) {
      return utils.reject("Path must begin with /", { exit: 1 });
    }

    const origin = api.realtimeOriginOrEmulator;
    const dbPath = utils.getDatabaseUrl(origin, options.instance, path);
    const dbJsonPath = utils.getDatabaseUrl(origin, options.instance, path + ".json");

    return prompt(options, [
      {
        type: "confirm",
        name: "confirm",
        default: false,
        message: "You are about to overwrite all data at " + clc.cyan(dbPath) + ". Are you sure?",
      },
    ]).then(function() {
      if (!options.confirm) {
        return utils.reject("Command aborted.", { exit: 1 });
      }

      var inStream =
        utils.stringToStream(options.data) ||
        (infile ? fs.createReadStream(infile) : process.stdin);

      if (!infile && !options.data) {
        utils.explainStdin();
      }

      var reqOptions = {
        url: dbJsonPath,
        json: true,
      };

      return api.addRequestHeaders(reqOptions).then(function(reqOptionsWithToken) {
        return new Promise(function(resolve, reject) {
          inStream.pipe(
            request.put(reqOptionsWithToken, function(err, res, body) {
              logger.info();
              if (err) {
                logger.debug(err);
                return reject(
                  new FirebaseError("Unexpected error while setting data", {
                    exit: 2,
                  })
                );
              } else if (res.statusCode >= 400) {
                return reject(responseToError(res, body));
              }

              utils.logSuccess("Data persisted successfully");
              logger.info();
              logger.info(
                clc.bold("View data at:"),
                utils.getDatabaseViewDataUrl(origin, options.instance, path)
              );
              return resolve();
            })
          );
        });
      });
    });
  });
