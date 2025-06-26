import * as Transport from "winston-transport";
import { SPLAT } from "triple-beam";
import { stripVTControlCharacters } from "util";
import { logger } from "../logger";

export class MemoryLogger extends Transport {
  logs: string[] = [];

  log(info: any, callback: () => void) {
    const segments = [info.message, ...(info[SPLAT] || [])].map((v) => {
      if (typeof v === "string") {
        return v;
      }
      try {
        return JSON.stringify(v);
      } catch (e) {
        return v;
      }
    });
    this.logs.push(stripVTControlCharacters(segments.join(" ")));
    callback();
  }
}

let memoryLogger: MemoryLogger | undefined;

export function attachMemoryLogger() {
  memoryLogger = new MemoryLogger();
  logger.add(memoryLogger);
}

export function getLogs(): string[] {
  return memoryLogger ? memoryLogger.logs : [];
}
