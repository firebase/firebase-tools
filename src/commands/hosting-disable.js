"use strict";

var Command = require("../command");
var requireInstance = require("../requireInstance");
var requirePermissions = require("../requirePermissions");
var api = require("../api");
var utils = require("../utils");
var { prompt } = require("../prompt");
var clc = require("cli-color");

module.exports = new Command("hosting:disable")
  .description("stop serving web traffic to your Firebase Hosting site")
  .option("-y, --confirm", "skip confirmation")
  .before(requirePermissions, ["firebasehosting.sites.update"])
  .before(requireInstance)
  .action(function(options) {
    return prompt(options, [
      {
        type: "confirm",
        name: "confirm",
        message:
          "Are you sure you want to disable Firebase Hosting?\n  " +
          clc.bold.underline("This will immediately make your site inaccessible!"),
      },
    ])
      .then(function() {
        if (!options.confirm) {
          return Promise.resolve();
        }

        return api.request("POST", "/v1beta1/sites/" + options.instance + "/releases", {
          auth: true,
          data: {
            type: "SITE_DISABLE",
          },
          origin: api.hostingApiOrigin,
        });
      })
      .then(function() {
        if (options.confirm) {
          utils.logSuccess(
            "Hosting has been disabled for " +
              clc.bold(options.project) +
              ". Deploy a new version to re-enable."
          );
        }
      });
  });
