"use strict";

var clc = require("cli-color");
var repl = require("repl");
var _ = require("lodash");

var request = require("request");
var util = require("util");

var serveFunctions = require("./serve/functions");
var LocalFunction = require("./localFunction");
var utils = require("./utils");
var logger = require("./logger");
var shell = require("./emulator/functionsEmulatorShell");
var commandUtils = require("./emulator/commandUtils");
var { EMULATORS_SUPPORTED_BY_FUNCTIONS } = require("./emulator/types");
var { EmulatorHubClient } = require("./emulator/hubClient");

module.exports = async function(options) {
  options.port = parseInt(options.port, 10);

  let debugPort = undefined;
  if (options.inspectFunctions) {
    debugPort = commandUtils.parseInspectionPort(options);
  }

  const hubClient = new EmulatorHubClient(options.project);
  let remoteEmulators = {};
  if (hubClient.foundHub()) {
    remoteEmulators = await hubClient.getEmulators();
    logger.debug("Running emulators: ", remoteEmulators);
  }

  const runningEmulators = EMULATORS_SUPPORTED_BY_FUNCTIONS.filter(
    (e) => remoteEmulators[e] !== undefined
  );
  const otherEmulators = EMULATORS_SUPPORTED_BY_FUNCTIONS.filter(
    (e) => remoteEmulators[e] === undefined
  );

  return serveFunctions
    .start(options, {
      // TODO(samstern): Note that these are not acctually valid FunctionsEmulatorArgs
      // and when we eventually move to all TypeScript we'll have to start adding
      // projectId and functionsDir here.
      quiet: true,
      remoteEmulators,
      debugPort,
    })
    .then(function() {
      return serveFunctions.connect();
    })
    .then(function() {
      const instance = serveFunctions.get();
      const emulator = new shell.FunctionsEmulatorShell(instance);

      if (emulator.emulatedFunctions && emulator.emulatedFunctions.length === 0) {
        logger.info("No functions emulated.");
        process.exit();
      }

      var initializeContext = function(context) {
        _.forEach(emulator.triggers, function(trigger) {
          if (_.includes(emulator.emulatedFunctions, trigger.name)) {
            var localFunction = new LocalFunction(trigger, emulator.urls, emulator);
            var triggerNameDotNotation = trigger.name.replace(/-/g, ".");
            _.set(context, triggerNameDotNotation, localFunction.call);
          }
        });
        context.help =
          "Instructions for the Functions Shell can be found at: " +
          "https://firebase.google.com/docs/functions/local-emulator";
      };

      for (const e of runningEmulators) {
        const info = remoteEmulators[e];
        utils.logLabeledBullet(
          "functions",
          `Connected to running ${clc.bold(e)} emulator at ${info.host}:${
            info.port
          }, calls to this service will affect the emulator`
        );
      }
      utils.logLabeledWarning(
        "functions",
        `The following emulators are not running, calls to these services will affect production: ${clc.bold(
          otherEmulators.join(", ")
        )}`
      );

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
      initializeContext(replServer.context);
      replServer.on("reset", initializeContext);

      return new Promise(function(resolve) {
        replServer.on("exit", function() {
          return serveFunctions
            .stop()
            .then(resolve)
            .catch(resolve);
        });
      });
    });
};
