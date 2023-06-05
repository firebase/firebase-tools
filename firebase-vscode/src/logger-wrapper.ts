
import { logger as cliLogger } from "../../src/logger";

export const pluginLogger: Record<string, any> = {};

const logLevels = ['debug', 'info', 'log', 'warn', 'error'];

for (const logLevel of logLevels) {
  pluginLogger[logLevel] = (...args) => {
    const prefixedArgs = ['[Firebase Plugin]', ...args];
    cliLogger[logLevel](...prefixedArgs);
  };
}
