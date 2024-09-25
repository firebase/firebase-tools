import { broker } from "./html-broker";

type Level = "debug" | "info" | "error";
const levels: Level[] = ["debug", "info", "error"];

type WebLogger = Record<Level, (...args: string[]) => void>;

const tempObject: Partial<WebLogger> = {};

for (const level of levels) {
  tempObject[level] = (...args: string[]) =>
    broker.send("writeLog", { level, args });
}

// Recast it now that it's populated.
const webLogger = tempObject as WebLogger;

export { webLogger };
