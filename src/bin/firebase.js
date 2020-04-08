#!/usr/bin/env node
"use strict";

// Make check for Node 6, which is no longer supported by the CLI.
const semver = require("semver");
const pkg = require("../../package.json");
const nodeVersion = process.version;
if (!semver.satisfies(nodeVersion, pkg.engines.node)) {
  console.error(
    "Firebase CLI v" +
      pkg.version +
      " is incompatible with Node.js " +
      nodeVersion +
      " Please upgrade Node.js to version " +
      pkg.engines.node
  );
  process.exit(1);
}

const updateNotifier = require("update-notifier")({ pkg: pkg });
updateNotifier.notify({ defer: true, isGlobal: true });

const client = require("..");
const errorOut = require("../errorOut").errorOut;
const winston = require("winston");
const { SPLAT } = require("triple-beam");
const logger = require("../logger");
const fs = require("fs");
const fsutils = require("../fsutils");
const path = require("path");
const clc = require("cli-color");
const ansiStrip = require("cli-color/strip");
const { configstore } = require("../configstore");
const _ = require("lodash");
let args = process.argv.slice(2);
const handlePreviewToggles = require("../handlePreviewToggles");
const utils = require("../utils");
let cmd;

const logFilename = path.join(process.cwd(), "/firebase-debug.log");

if (!process.env.DEBUG && _.includes(args, "--debug")) {
  process.env.DEBUG = true;
}

process.env.IS_FIREBASE_CLI = true;

logger.add(
  new winston.transports.File({
    level: "debug",
    filename: logFilename,
    format: winston.format.printf((info) => {
      const segments = [info.message, ...(info[SPLAT] || [])].map(utils.tryStringify);
      return `[${info.level}] ${ansiStrip(segments.join(" "))}`;
    }),
  })
);

logger.debug(_.repeat("-", 70));
logger.debug("Command:      ", process.argv.join(" "));
logger.debug("CLI Version:  ", pkg.version);
logger.debug("Platform:     ", process.platform);
logger.debug("Node Version: ", process.version);
logger.debug("Time:         ", new Date().toString());
if (utils.envOverrides.length) {
  logger.debug("Env Overrides:", utils.envOverrides.join(", "));
}
logger.debug(_.repeat("-", 70));
logger.debug();

require("../fetchMOTD").fetchMOTD();

process.on("exit", function(code) {
  code = process.exitCode || code;
  if (!process.env.DEBUG && code < 2 && fsutils.fileExistsSync(logFilename)) {
    fs.unlinkSync(logFilename);
  }

  if (code > 0 && process.stdout.isTTY) {
    const lastError = configstore.get("lastError") || 0;
    const timestamp = Date.now();
    if (lastError > timestamp - 120000) {
      let help;
      if (code === 1 && cmd) {
        const commandName = _.get(_.last(cmd.args), "_name", "[command]");
        help = "Having trouble? Try " + clc.bold("firebase " + commandName + " --help");
      } else {
        help = "Having trouble? Try again or contact support with contents of firebase-debug.log";
      }

      if (cmd) {
        console.log();
        console.log(help);
      }
    }
    configstore.set("lastError", timestamp);
  } else {
    configstore.delete("lastError");
  }
});
require("exit-code");

process.on("uncaughtException", function(err) {
  errorOut(err);
});

if (!handlePreviewToggles(args)) {
  cmd = client.cli.parse(process.argv);

  // determine if there are any non-option arguments. if not, display help
  args = args.filter(function(arg) {
    return arg.indexOf("-") < 0;
  });
  if (!args.length) {
    client.cli.help();
  }
}
