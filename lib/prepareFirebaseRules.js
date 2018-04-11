"use strict";

var chalk = require("chalk");
var fs = require("fs");

var api = require("./api");
var utils = require("./utils");

var prepareFirebaseRules = function(component, options, payload) {
  var rulesFileName = component + ".rules";
  var rulesPath = options.config.get(rulesFileName);
  if (rulesPath) {
    rulesPath = options.config.path(rulesPath);
    var src = fs.readFileSync(rulesPath, "utf8");
    utils.logBullet(chalk.bold.cyan(component + ":") + " checking rules for compilation errors...");
    return api
      .request("POST", "/v1/projects/" + encodeURIComponent(options.project) + ":test", {
        origin: api.rulesOrigin,
        data: {
          source: {
            files: [
              {
                content: src,
                name: rulesFileName,
              },
            ],
          },
        },
        auth: true,
      })
      .then(function(response) {
        if (response.body && response.body.issues && response.body.issues.length > 0) {
          var add = response.body.issues.length === 1 ? "" : "s";
          var message =
            "Compilation error" +
            add +
            " in " +
            chalk.bold(options.config.get(rulesFileName)) +
            ":\n";
          response.body.issues.forEach(function(issue) {
            message +=
              "\n[" +
              issue.severity.substring(0, 1) +
              "] " +
              issue.sourcePosition.line +
              ":" +
              issue.sourcePosition.column +
              " - " +
              issue.description;
          });

          return utils.reject(message, { exit: 1 });
        }

        utils.logSuccess(chalk.bold.green(component + ":") + " rules file compiled successfully");
        payload[component] = {
          rules: [{ name: options.config.get(rulesFileName), content: src }],
        };
        return Promise.resolve();
      });
  }

  return Promise.resolve();
};

module.exports = prepareFirebaseRules;
