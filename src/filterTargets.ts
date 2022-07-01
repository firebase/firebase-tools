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

import { intersection, difference } from "lodash";
import { FirebaseError } from "./error";
import { Options } from "./options";

/**
 * Filters targets from options with valid targets as specified.
 * @param options CLI options.
 * @param validTargets Targets that are valid.
 * @return List of targets as specified and filtered by options and validTargets.
 */
export function filterTargets(options: Options, validTargets: string[]): string[] {
  let targets = validTargets.filter((t) => {
    return options.config.has(t);
  });
  if (options.only) {
    targets = intersection(
      targets,
      options.only.split(",").map((opt: string) => {
        return opt.split(":")[0];
      })
    );
  } else if (options.except) {
    targets = difference(targets, options.except.split(","));
  }
  if (targets.length === 0) {
    let msg = "Cannot understand what targets to deploy/serve.";

    if (options.only) {
      msg += ` No targets in firebase.json match '--only ${options.only}'.`;
    } else if (options.except) {
      msg += ` No targets in firebase.json match '--except ${options.except}'.`;
    }

    if (process.platform === "win32") {
      msg +=
        ' If you are using PowerShell make sure you place quotes around any comma-separated lists (ex: --only "functions,firestore").';
    }

    throw new FirebaseError(msg);
  }
  return targets;
}
