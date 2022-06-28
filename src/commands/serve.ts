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

import * as clc from "cli-color";

import { Command } from "../command";
import { logger } from "../logger";
import * as utils from "../utils";
import { requirePermissions } from "../requirePermissions";
import { requireConfig } from "../requireConfig";
import { serve } from "../serve/index";
import { filterTargets } from "../filterTargets";
import { needProjectNumber } from "../projectUtils";
import { FirebaseError } from "../error";

const VALID_TARGETS = ["hosting", "functions"];
const REQUIRES_AUTH = ["hosting", "functions"];
const ALL_TARGETS = Array.from(new Set(["database", "firestore", ...VALID_TARGETS]));

function filterOnly(list: string[], only = ""): string[] {
  if (!only) {
    return [];
  }
  const targets = only.split(",").map((o) => o.split(":")[0]);
  return targets.filter((t) => list.includes(t));
}

export const command = new Command("serve")
  .description("start a local server for your static assets")
  .option("-p, --port <port>", "the port on which to listen (default: 5000)", 5000)
  .option("-o, --host <host>", "the host on which to listen (default: localhost)", "localhost")
  .option(
    "--only <targets>",
    "only serve specified targets (valid targets are: " + VALID_TARGETS.join(", ") + ")"
  )
  .option(
    "--except <targets>",
    "serve all except specified targets (valid targets are: " + VALID_TARGETS.join(", ") + ")"
  )
  .before((options) => {
    if (
      options.only &&
      options.only.length > 0 &&
      filterOnly(REQUIRES_AUTH, options.only).length === 0
    ) {
      return Promise.resolve();
    }
    return requireConfig(options)
      .then(() => requirePermissions(options))
      .then(() => needProjectNumber(options));
  })
  .action((options) => {
    options.targets = filterOnly(ALL_TARGETS, options.only);
    if (options.targets.includes("database") || options.targets.includes("firestore")) {
      throw new FirebaseError(
        `Please use ${clc.bold(
          "firebase emulators:start"
        )} to start the Realtime Database or Cloud Firestore emulators. ${clc.bold(
          "firebase serve"
        )} only supports Hosting and Cloud Functions.`
      );
    }

    options.targets = filterOnly(VALID_TARGETS, options.only);
    if (options.targets.length > 0) {
      return serve(options);
    }
    if (options.config) {
      logger.info();
      logger.info(
        clc.bold(clc.white("===") + " Serving from '" + options.config.projectDir + "'...")
      );
      logger.info();
    } else {
      utils.logWarning(
        "No Firebase project directory detected. Serving static content from " +
          clc.bold(options.cwd || process.cwd())
      );
    }
    options.targets = filterTargets(options, VALID_TARGETS);
    return serve(options);
  });
