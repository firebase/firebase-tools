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
import { FirebaseError } from "../error";

export const command = new Command("target:apply <type> <name> <resources...>")
  .description("apply a deploy target to a resource")
  .before(requireConfig)
  .action((type, name, resources, options) => {
    if (!options.project) {
      throw new FirebaseError(
        `Must have an active project to set deploy targets. Try ${clc.bold("firebase use --add")}`
      );
    }

    const changes = options.rc.applyTarget(options.project, type, name, resources);

    utils.logSuccess(
      `Applied ${type} target ${clc.bold(name)} to ${clc.bold(resources.join(", "))}`
    );
    for (const change of changes) {
      utils.logWarning(
        `Previous target ${clc.bold(change.target)} removed from ${clc.bold(change.resource)}`
      );
    }
    logger.info();
    logger.info(`Updated: ${name} (${options.rc.target(options.project, type, name).join(",")})`);
  });
