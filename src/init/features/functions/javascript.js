"use strict";

var _ = require("lodash");
var fs = require("fs");
var path = require("path");

var npmDependencies = require("./npm-dependencies");
var { prompt } = require("../../../prompt");

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

module.exports = function (setup, config, options) {
  return prompt(
    {
      ...setup.functions,
      nonInteractive: options.nonInteractive,
      lint: options.interactiveAnswers.lint,
    },
    [
      {
        name: "lint",
        type: "confirm",
        message: "Do you want to use ESLint to catch probable bugs and enforce style?",
        default: false,
      },
    ]
  )
    .then(function () {
      if (setup.functions.lint) {
        _.set(setup, "config.functions.predeploy", ['npm --prefix "$RESOURCE_DIR" run lint']);
        return config
          .askWriteProjectFile(
            "functions/package.json",
            PACKAGE_LINTING_TEMPLATE,
            options.nonInteractive
          )
          .then(function () {
            config.askWriteProjectFile(
              "functions/.eslintrc.js",
              ESLINT_TEMPLATE,
              options.nonInteractive
            );
          });
      }
      return config.askWriteProjectFile(
        "functions/package.json",
        PACKAGE_NO_LINTING_TEMPLATE,
        options.nonInteractive
      );
    })
    .then(function () {
      return config.askWriteProjectFile(
        "functions/index.js",
        INDEX_TEMPLATE,
        options.nonInteractive
      );
    })
    .then(function () {
      return config.askWriteProjectFile(
        "functions/.gitignore",
        GITIGNORE_TEMPLATE,
        options.nonInteractive
      );
    })
    .then(function () {
      return npmDependencies.askInstallDependencies(
        {
          ...setup.functions,
          nonInteractive: options.nonInteractive,
          npm: options.interactiveAnswers.npm,
        },
        config
      );
    });
};
