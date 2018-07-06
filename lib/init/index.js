"use strict";

var _ = require("lodash");
var clc = require("cli-color");

var logger = require("../logger");
var features = require("./features");

var init = function(setup, config, options) {
  var nextFeature = setup.features.shift();
  if (nextFeature) {
    logger.info(clc.bold("\n" + clc.white("=== ") + _.capitalize(nextFeature) + " Setup"));
    return Promise.resolve(features[nextFeature](setup, config, options)).then(function() {
      return init(setup, config, options);
    });
  }
  return Promise.resolve();
};

module.exports = init;
