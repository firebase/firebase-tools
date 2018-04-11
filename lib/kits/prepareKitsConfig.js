"use strict";
var _ = require("lodash");
var chalk = require("chalk");

var FirebaseError = require("../error");
var prompt = require("../prompt");
var utils = require("../utils");

function _promptForKitConfig(kitName, kitConfig) {
  var prompts = [];
  // TODO: name does not allow for dashes
  prompts.push({
    name: "kitname",
    type: "input",
    default: kitName,
    message: "What would you like to name this kit?",
  });

  for (var i = 0; i < kitConfig.length; i++) {
    prompts.push({
      name: kitConfig[i].name,
      type: "input",
      default: kitConfig[i].default,
      message: kitConfig[i].label,
    });
  }
  return prompt({ kitsource: kitName }, prompts)
    .then(function(answers) {
      // prompting again if needed
      var promptAgains = _.chain(kitConfig)
        .filter(function(question) {
          var value = answers[question.name];
          return !("default" in question) && !value;
        })
        .map(function(needsAnswer) {
          utils.logWarning(
            chalk.yellow.bold("kits: ") + chalk.bold(needsAnswer.name) + " requires a value."
          );
          return {
            name: needsAnswer.name,
            type: "input",
            message: needsAnswer.label,
          };
        })
        .value();
      return prompt(answers, promptAgains);
    })
    .then(function(configList) {
      // checking that all values that need to be set are set and of the correct type
      return utils.promiseAllSettled(
        _.map(kitConfig, function(question) {
          return new Promise(function(resolve, reject) {
            var configValue = configList[question.name];
            // if value still isn't set
            if (!("default" in question) && !configValue) {
              reject(new FirebaseError("The following value needs to be set: " + question.name));
            }
            switch (question.type) {
              case "number":
                configList[question.name] = _.toNumber(configValue);
                break;
              case "boolean":
                // why is there no toBoolean in lodash
                configList[question.name] = configValue === "true";
                break;
              default:
                // keep as a string
                configList[question.name] = _.toString(configValue);
            }
            resolve(configList);
          });
        })
      );
    })
    .then(function(allPrompts) {
      return new Promise(function(resolve, reject) {
        var failed = _.chain(allPrompts)
          .filter({ state: "rejected" })
          .map("reason")
          .value();
        var config = _.find(allPrompts, function(succeeded) {
          return succeeded.state === "fulfilled";
        });
        if (failed.length > 0) {
          return reject(new FirebaseError("The following values need to be set.\n" + failed));
        }
        return resolve(config.value);
      });
    });
}

module.exports = {
  prompt: _promptForKitConfig,
};
