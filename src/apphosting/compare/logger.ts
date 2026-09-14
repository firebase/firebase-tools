// Smart local logger proxy to decouple compare module from firebase-tools
let internalLogger: any = console;

try {
  // Attempt to load global firebase-tools logger
  const globalLogger = require("../../logger").logger;
  if (globalLogger) {
    internalLogger = globalLogger;
  }
} catch (e) {
  // Standalone fallback
  internalLogger = {
    info: (msg: string) => console.log(msg),
    warn: (msg: string) => console.warn(msg),
    error: (msg: string) => console.error(msg),
    debug: (msg: string) => console.debug(msg),
  };
}

export const logger = {
  info: (msg: string, ...args: any[]) => {
    if (typeof internalLogger.info === "function") {
      internalLogger.info(msg, ...args);
    } else {
      console.log(msg, ...args);
    }
  },
  warn: (msg: string, ...args: any[]) => {
    if (typeof internalLogger.warn === "function") {
      internalLogger.warn(msg, ...args);
    } else {
      console.warn(msg, ...args);
    }
  },
  error: (msg: string, ...args: any[]) => {
    if (typeof internalLogger.error === "function") {
      internalLogger.error(msg, ...args);
    } else {
      console.error(msg, ...args);
    }
  },
  debug: (msg: string, ...args: any[]) => {
    if (typeof internalLogger.debug === "function") {
      internalLogger.debug(msg, ...args);
    } else {
      console.debug(msg, ...args);
    }
  }
};
