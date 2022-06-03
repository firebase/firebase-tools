"use strict";

var _ = require("lodash");
var fs = require("fs");
var path = require("path");

var npmDependencies = require("./npm-dependencies");
var { prompt } = require("../../../prompt");
var utils = require("../../../utils");
const { isValidRuntime } = require("../../../deploy/functions/runtimes/index");

var TEMPLATE_ROOT = path.resolve(__dirname, "../../../../templates/init/functions/javascript/");
var INDEX_TEMPLATE = fs.readFileSync(path.join(TEMPLATE_ROOT, "index.js"), "utf8");
var PACKAGE_LINTING_TEMPLATE = fs.readFileSync(
  path.join(TEMPLATE_ROOT, "package.lint.json"),
  "utf8"
);
var PACKAGE_NO_LINTING_TEMPLATE = fs.readFileSync(
  path.join(TEMPLATE_ROOT, "package.nolint.json"),
  "utf8"
);
var ESLINT_TEMPLATE = fs.readFileSync(path.join(TEMPLATE_ROOT, "_eslintrc"), "utf8");
var GITIGNORE_TEMPLATE = fs.readFileSync(path.join(TEMPLATE_ROOT, "_gitignore"), "utf8");

module.exports = function (setup, config) {
  return prompt(setup.functions, [
    {
      name: "lint",
      type: "confirm",
      message: "Do you want to use ESLint to catch probable bugs and enforce style?",
      default: false,
    },
  ])
    .then(function () {
      if (setup.functions.lint) {
        _.set(setup, "config.functions.predeploy", ['npm --prefix "$RESOURCE_DIR" run lint']);
        return config
          .askWriteProjectFile("functions/package.json", getPackage(true))
          .then(function () {
            config.askWriteProjectFile("functions/.eslintrc.js", ESLINT_TEMPLATE);
          });
      }
      return config.askWriteProjectFile("functions/package.json", getPackage(false));
    })
    .then(function () {
      return config.askWriteProjectFile("functions/index.js", INDEX_TEMPLATE);
    })
    .then(function () {
      return config.askWriteProjectFile("functions/.gitignore", GITIGNORE_TEMPLATE);
    })
    .then(function () {
      return npmDependencies.askInstallDependencies(setup.functions, config);
    });
};

function getPackage(useLint) {
  const nodeEngineVersion = utils.getNodeVersionString();
  if (!isValidRuntime(`nodejs${nodeEngineVersion}`)) {
    utils.logWarning(`Node ${nodeEngineVersion} is no longer supported in Google Cloud Functions.`);
    utils.logWarning(
      "See https://firebase.google.com/docs/functions/manage-functions for more details"
    );
  }

  if (useLint) {
    return PACKAGE_LINTING_TEMPLATE.replace(/{{NODE_VERSION}}/g, nodeEngineVersion);
  }
  return PACKAGE_NO_LINTING_TEMPLATE.replace(/{{NODE_VERSION}}/g, nodeEngineVersion);
}
