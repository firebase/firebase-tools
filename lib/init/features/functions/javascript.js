"use strict";

var _ = require("lodash");
var fs = require("fs");
var path = require("path");

var npmDependencies = require("./npm-dependencies");
var prompt = require("../../../prompt");

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
var ESLINT_TEMPLATE = fs.readFileSync(path.join(TEMPLATE_ROOT, "eslint.json"), "utf8");

module.exports = function(setup, config) {
  return prompt(setup.functions, [
    {
      name: "lint",
      type: "confirm",
      message: "Do you want to use ESLint to catch probable bugs and enforce style?",
      default: false,
    },
  ])
    .then(function() {
      if (setup.functions.lint) {
        _.set(setup, "config.functions.predeploy", ['npm --prefix "$RESOURCE_DIR" run lint']);
        return config
          .askWriteProjectFile("functions/package.json", PACKAGE_LINTING_TEMPLATE)
          .then(function() {
            config.askWriteProjectFile("functions/.eslintrc.json", ESLINT_TEMPLATE);
          });
      }
      return config.askWriteProjectFile("functions/package.json", PACKAGE_NO_LINTING_TEMPLATE);
    })
    .then(function() {
      return config.askWriteProjectFile("functions/index.js", INDEX_TEMPLATE);
    })
    .then(function() {
      return npmDependencies.askInstallDependencies(setup, config);
    });
};
