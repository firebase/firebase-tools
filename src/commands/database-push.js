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
var _ = require("lodash");

module.exports = new Command("database:push <path> [infile]")
  .description("add a new JSON object to a list of data in your Firebase")
  .option("-d, --data <data>", "specify escaped JSON directly")
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

    var inStream =
      utils.stringToStream(options.data) || (infile ? fs.createReadStream(infile) : process.stdin);

    const origin = api.realtimeOriginOrEmulator;
    var url = utils.getDatabaseUrl(origin, options.instance, path + ".json");

    if (!infile && !options.data) {
      utils.explainStdin();
    }

    var reqOptions = {
      url: url,
      json: true,
    };

    return api.addRequestHeaders(reqOptions).then(function(reqOptionsWithToken) {
      return new Promise(function(resolve, reject) {
        inStream.pipe(
          request.post(reqOptionsWithToken, function(err, res, body) {
            logger.info();
            if (err) {
              return reject(
                new FirebaseError("Unexpected error while pushing data", {
                  exit: 2,
                })
              );
            } else if (res.statusCode >= 400) {
              return reject(responseToError(res, body));
            }

            if (!_.endsWith(path, "/")) {
              path += "/";
            }

            var consoleUrl = utils.getDatabaseViewDataUrl(
              origin,
              options.instance,
              path + body.name
            );

            utils.logSuccess("Data pushed successfully");
            logger.info();
            logger.info(clc.bold("View data at:"), consoleUrl);
            return resolve({ key: body.name });
          })
        );
      });
    });
  });
