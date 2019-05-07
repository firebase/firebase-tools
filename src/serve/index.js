"use strict";

var _ = require("lodash");

var logger = require("../logger");

var TARGETS = {
  hosting: require("./hosting"),
  functions: require("./functions"),
  database: require("./database"),
  firestore: require("./firestore"),
};

var _serve = function(options) {
  var targetNames = options.targets;
  options.port = parseInt(options.port, 10);
  return Promise.all(
    _.map(targetNames, function(targetName) {
      var target = TARGETS[targetName];
      return target.start(options);
    })
  )
    .then(function() {
      return Promise.all(
        _.map(targetNames, function(targetName) {
          var target = TARGETS[targetName];
          return target.connect();
        })
      );
    })
    .then(function() {
      return new Promise(function(resolve) {
        process.on("SIGINT", function() {
          logger.info("Shutting down...");
          return Promise.all(
            _.map(targetNames, function(targetName) {
              var target = TARGETS[targetName];
              return target.stop(options);
            })
          )
            .then(resolve)
            .catch(resolve);
        });
      });
    });
};

module.exports = _serve;
