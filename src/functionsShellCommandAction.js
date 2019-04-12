"use strict";

var repl = require("repl");
var _ = require("lodash");

var request = require("request");
var util = require("util");

var serveFunctions = require("./serve/functions");
var LocalFunction = require("./localFunction");
var logger = require("./logger");

module.exports = function(options) {
  options.port = parseInt(options.port, 10);

  return serveFunctions
    .start(options)
    .then(function() {
      const emulator = serveFunctions.get();
      if (emulator.emulatedFunctions && emulator.emulatedFunctions.length === 0) {
        logger.info("No functions emulated.");
        process.exit();
      }

      var writer = function(output) {
        // Prevent full print out of Request object when a request is made
        if (output instanceof request.Request) {
          return "Sent request to function.";
        }
        return util.inspect(output);
      };

      var prompt = "firebase > ";

      var replServer = repl.start({
        prompt: prompt,
        writer: writer,
        useColors: true,
      });
      _.forEach(emulator.triggers, function(trigger) {
        if (_.includes(emulator.emulatedFunctions, trigger.name)) {
          var localFunction = new LocalFunction(trigger, emulator.urls, emulator.controller);
          var triggerNameDotNotation = trigger.name.replace(/\-/g, ".");
          _.set(replServer.context, triggerNameDotNotation, localFunction.call);
        }
      });
      replServer.context.help =
        "Instructions for the Functions Shell can be found at: " +
        "https://firebase.google.com/docs/functions/local-emulator";
    })
    .then(function() {
      return new Promise(function(resolve) {
        process.on("SIGINT", function() {
          return serveFunctions
            .stop()
            .then(resolve)
            .catch(resolve);
        });
      });
    });
};
