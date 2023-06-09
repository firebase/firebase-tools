import { logger as cliLogger } from "../../src/logger";
import { setInquirerLogger } from "./stubs/inquirer-stub";

export const pluginLogger: Record<string, (...args) => void> = {};

const logLevels = ['debug', 'info', 'log', 'warn', 'error'];

for (const logLevel of logLevels) {
  pluginLogger[logLevel] = (...args) => {
    const prefixedArgs = ['[Firebase Plugin]', ...args];
    cliLogger[logLevel](...prefixedArgs);
  };
}

setInquirerLogger(pluginLogger);