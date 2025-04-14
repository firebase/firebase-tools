import { LogLevel, pluginLogger } from "../../logger-wrapper";
import { addTearDown } from "./test_hooks";

export type LogSpy = {
  [key in LogLevel]: Array<string>;
};

export function spyLogs() {
  // Restore the logger after the test ends
  const loggerBackup = { ...pluginLogger };
  addTearDown(() => {
    Object.assign(pluginLogger, loggerBackup);
  });

  // Spy on the logger
  const allLogs: LogSpy = {
    debug: [],
    info: [],
    log: [],
    warn: [],
    error: [],
  };
  for (const key in loggerBackup) {
    if (key in allLogs) {
      pluginLogger[key as LogLevel] = function (...args: any[]) {
        const logs = allLogs[key as LogLevel];

        logs.push(args.join(" "));
      };
    }
  }

  return allLogs;
}
