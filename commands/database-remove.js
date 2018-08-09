"use strict";

var Command = require("../lib/command");
var requireAccess = require("../lib/requireAccess");
var request = require("request");
var api = require("../lib/api");
var responseToError = require("../lib/responseToError");
var FirebaseError = require("../lib/error");

var utils = require("../lib/utils");
var prompt = require("../lib/prompt");
var clc = require("cli-color");
var _ = require("lodash");

module.exports = new Command("database:remove <path>")
  .description("remove data from your Firebase at the specified path")
  .option("-y, --confirm", "pass this option to bypass confirmation prompt")
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, use default database instance)"
  )
  .before(requireAccess)
  .action(function(path, options) {
    if (!_.startsWith(path, "/")) {
      return utils.reject("Path must begin with /", { exit: 1 });
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
        return utils.reject("Command aborted.", { exit: 1 });
      }
      var url = utils.addSubdomain(api.realtimeOrigin, options.instance) + path + ".json?";
      var reqOptions = {
        url: url,
        json: true,
      };

      return api.addRequestHeaders(reqOptions).then(function(reqOptionsWithToken) {
        return new Promise(function(resolve, reject) {
          request.del(reqOptionsWithToken, function(err, res, body) {
            if (err) {
              return reject(
                new FirebaseError("Unexpected error while removing data", {
                  exit: 2,
                })
              );
            } else if (res.statusCode >= 400) {
              return reject(responseToError(res, body));
            }

            utils.logSuccess("Data removed successfully");
            return resolve();
          });
        });
      });
    });
  });
