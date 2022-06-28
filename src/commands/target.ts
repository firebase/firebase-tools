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
import { requireConfig } from "../requireConfig";
import * as utils from "../utils";

interface targetMap {
  [target: string]: string[];
}

function logTargets(type: string, targets: targetMap): void {
  logger.info(clc.cyan("[ " + type + " ]"));
  for (const [name, resources] of Object.entries(targets)) {
    logger.info(name, "(" + (resources || []).join(",") + ")");
  }
}

export const command = new Command("target [type]")
  .description("display configured deploy targets for the current project")
  .before(requireConfig)
  .action((type, options) => {
    if (!options.project) {
      return utils.reject("No active project, cannot list deploy targets.");
    }

    logger.info("Resource targets for", clc.bold(options.project) + ":");
    logger.info();
    if (type) {
      const targets = options.rc.targets(options.project, type);
      logTargets(type, targets);
      return targets;
    }

    const allTargets: { [product: string]: targetMap } = options.rc.allTargets(options.project);
    for (const [targetType, targetName] of Object.entries(allTargets)) {
      logTargets(targetType, targetName);
    }
    return allTargets;
  });
