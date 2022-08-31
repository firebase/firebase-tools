import * as fs from "fs";
import * as spawn from "cross-spawn";
import * as clc from "colorette";
import * as _ from "lodash";

import { FirebaseError } from "./error";

export function parseBoltRules(filename: string): string {
  const ruleSrc = fs.readFileSync(filename, "utf8");

  // Use 'npx' to spawn 'firebase-bolt' so that it can be picked up
  // from either a global install or from local ./node_modules/
  const result = spawn.sync("npx", ["--no-install", "firebase-bolt"], {
    input: ruleSrc,
    timeout: 10000,
    encoding: "utf-8",
  });

  if (result.error && _.get(result.error, "code") === "ENOENT") {
    throw new FirebaseError("Bolt not installed, run " + clc.bold("npm install -g firebase-bolt"));
  } else if (result.error) {
    throw new FirebaseError("Unexpected error parsing Bolt rules file", {
      exit: 2,
    });
  } else if (result.status != null && result.status > 0) {
    throw new FirebaseError(result.stderr.toString(), { exit: 1 });
  }

  return result.stdout;
}
