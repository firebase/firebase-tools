"use strict";

const winston = require("winston");

function expandErrors(logger) {
  const oldLogFunc = logger.log;
  logger.log = function(...logArgs) {
    const args = logArgs.slice(0);
    if (args.length >= 2 && args[1] instanceof Error) {
      args[1] = args[1].stack;
    }
    return oldLogFunc.apply(this, args);
  };
  return logger;
}

const logger = expandErrors(winston.createLogger());

// Set a default silent logger to suppress logs during tests
logger.add(new winston.transports.Console({ silent: true }));

logger.tryStringify = (value) => {
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value);
  } catch {
    return value;
  }
};

logger.tryParse = (value) => {
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const debug = logger.debug;
logger.debug = function(...args) {
  args[0] = "[" + new Date().toISOString() + "] " + (args[0] || "");
  debug(...args);
};

logger.exitOnError = false;
module.exports = logger;
