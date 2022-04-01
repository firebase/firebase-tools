#!/usr/bin/env node
"use strict";

// Make check for Node 8, which is no longer supported by the CLI.
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
const clc = require("cli-color");
const TerminalRenderer = require("marked-terminal");
const marked = require("marked").marked;
marked.setOptions({
  renderer: new TerminalRenderer(),
});
const updateMessage =
  `Update available ${clc.xterm(240)("{currentVersion}")} → ${clc.green("{latestVersion}")}\n` +
  `To update to the latest version using npm, run\n${clc.cyan("npm install -g firebase-tools")}\n` +
  `For other CLI management options, visit the ${marked(
    "[CLI documentation](https://firebase.google.com/docs/cli#update-cli)"
  )}`;
updateNotifier.notify({ defer: true, isGlobal: true, message: updateMessage });

const client = require("..");
const errorOut = require("../errorOut").errorOut;
const winston = require("winston");
const { SPLAT } = require("triple-beam");
const { logger } = require("../logger");
const fs = require("fs");
const fsutils = require("../fsutils");
const path = require("path");
const ansiStrip = require("cli-color/strip");
const { configstore } = require("../configstore");
const _ = require("lodash");
let args = process.argv.slice(2);
const { handlePreviewToggles } = require("../handlePreviewToggles");
const utils = require("../utils");
let cmd;

function findAvailableLogFile() {
  const candidates = ["firebase-debug.log"];
  for (let i = 1; i < 10; i++) {
    candidates.push(`firebase-debug.${i}.log`);
  }

  for (const c of candidates) {
    const logFilename = path.join(process.cwd(), c);

    try {
      const fd = fs.openSync(logFilename, "r+");
      fs.closeSync(fd);
      return logFilename;
    } catch (e) {
      if (e.code === "ENOENT") {
        // File does not exist, which is fine
        return logFilename;
      }

      // Any other error (EPERM, etc) means we won't be able to log to
      // this file so we skip it.
    }
  }

  throw new Error("Unable to obtain permissions for firebase-debug.log");
}

const logFilename = findAvailableLogFile();

if (!process.env.DEBUG && _.includes(args, "--debug")) {
  process.env.DEBUG = "true";
}

process.env.IS_FIREBASE_CLI = "true";

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

process.on("exit", function (code) {
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

process.on("uncaughtException", function (err) {
  errorOut(err);
});

if (!handlePreviewToggles(args)) {
  cmd = client.cli.parse(process.argv);

  // determine if there are any non-option arguments. if not, display help
  args = args.filter(function (arg) {
    return arg.indexOf("-") < 0;
  });
  if (!args.length) {
    client.cli.help();
  }
}
