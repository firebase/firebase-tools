"use strict";

var _ = require("lodash");
var clc = require("cli-color");

var auth = require("./auth");
var configstore = require("./configstore");
var previews = require("./previews");

var _errorOut = function(name) {
  console.log(clc.bold.red("Error:"), "Did not recognize preview feature", clc.bold(name));
  process.exit(1);
};

module.exports = function(args) {
  var isValidPreview = _.has(previews, args[1]);
  if (args[0] === "--open-sesame") {
    if (isValidPreview) {
      console.log("Enabling preview feature", clc.bold(args[1]) + "...");
      previews[args[1]] = true;
      configstore.set("previews", previews);
      console.log("Preview feature enabled!");
      return process.exit(0);
    }

    _errorOut();
  } else if (args[0] === "--close-sesame") {
    if (isValidPreview) {
      console.log("Disabling preview feature", clc.bold(args[1]));
      _.unset(previews, args[1]);
      configstore.set("previews", previews);
      return process.exit(0);
    }

    _errorOut();
  }

  return undefined;
};
