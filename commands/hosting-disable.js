"use strict";

var Command = require("../lib/command");
var requireAccess = require("../lib/requireAccess");
var api = require("../lib/api");
var utils = require("../lib/utils");
var prompt = require("../lib/prompt");
var clc = require("cli-color");

module.exports = new Command("hosting:disable")
  .description("stop serving web traffic to your Firebase Hosting site")
  .option("-y, --confirm", "skip confirmation")
  .before(requireAccess)
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
