/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import * as fs from "fs";
import * as spawn from "cross-spawn";
import * as clc from "cli-color";
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
