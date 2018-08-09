"use strict";

var Command = require("../lib/command");
var requireAccess = require("../lib/requireAccess");
var request = require("request");
var api = require("../lib/api");
var responseToError = require("../lib/responseToError");
var FirebaseError = require("../lib/error");

var utils = require("../lib/utils");
var clc = require("cli-color");
var logger = require("../lib/logger");
var fs = require("fs");
var prompt = require("../lib/prompt");
var _ = require("lodash");

module.exports = new Command("database:update <path> [infile]")
  .description("update some of the keys for the defined path in your Firebase")
  .option("-d, --data <data>", "specify escaped JSON directly")
  .option("-y, --confirm", "pass this option to bypass confirmation prompt")
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, use default database instance)"
  )
  .before(requireAccess)
  .action(function(path, infile, options) {
    if (!_.startsWith(path, "/")) {
      return utils.reject("Path must begin with /", { exit: 1 });
    }

    return prompt(options, [
      {
        type: "confirm",
        name: "confirm",
        default: false,
        message:
          "You are about to modify data at " +
          clc.cyan(utils.addSubdomain(api.realtimeOrigin, options.instance) + path) +
          ". Are you sure?",
      },
    ]).then(function() {
      if (!options.confirm) {
        return utils.reject("Command aborted.", { exit: 1 });
      }

      var inStream =
        utils.stringToStream(options.data) ||
        (infile ? fs.createReadStream(infile) : process.stdin);
      var url = utils.addSubdomain(api.realtimeOrigin, options.instance) + path + ".json?";

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
            request.patch(reqOptionsWithToken, function(err, res, body) {
              logger.info();
              if (err) {
                return reject(
                  new FirebaseError("Unexpected error while setting data", {
                    exit: 2,
                  })
                );
              } else if (res.statusCode >= 400) {
                return reject(responseToError(res, body));
              }

              utils.logSuccess("Data updated successfully");
              logger.info();
              logger.info(
                clc.bold("View data at:"),
                utils.consoleUrl(options.project, "/database/data" + path)
              );
              return resolve();
            })
          );
        });
      });
    });
  });
