import { outputFileSync, readFileSync } from "fs-extra";
import * as path from "path";
import * as logger from "../../logger";

function cachePath(cwd: string, name: string): string {
  return path.resolve(cwd, ".firebase/hosting." + name + ".cache");
}

export interface HashCache {
  [file: string]: {
    mtime: number;
    hash: string;
  };
}

export function load(cwd: string, name: string): HashCache {
  try {
    const out: HashCache = {};
    const lines = readFileSync(cachePath(cwd, name), {
      encoding: "utf8",
    });
    lines.split("\n").forEach((line) => {
      const d = line.split(",");
      if (d.length === 3) {
        out[d[0]] = { mtime: parseInt(d[1], 10), hash: d[2] };
      }
    });
    return out;
  } catch (e) {
    if (e.code === "ENOENT") {
      logger.debug("[hosting] hash cache [" + name + "] not populated");
    } else {
      logger.debug("[hosting] hash cache [" + name + "] load error:", e.message);
    }
    return {};
  }
}

export function dump(cwd: string, name: string, data: HashCache): void {
  let st: string = "";
  let count: number = 0;

  for (const file in data) {
    if (data.hasOwnProperty(file)) {
      count++;
      st += path + "," + data[file].mtime + "," + data[file].hash + "\n";
    }
  }

  try {
    outputFileSync(cachePath(cwd, name), st, { encoding: "utf8" });
    logger.debug("[hosting] hash cache [" + name + "] stored for", count, "files");
  } catch (e) {
    logger.debug("[hosting] unable to store hash cache [" + name + "]", e.stack);
  }
}
