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
import * as fs from "fs";

import { logger } from "../../logger";
import { promptOnce } from "../../prompt";
import { ensureLocationSet } from "../../ensureCloudResourceLocation";

const RULES_TEMPLATE = fs.readFileSync(
  __dirname + "/../../../templates/init/storage/storage.rules",
  "utf8"
);

export async function doSetup(setup: any, config: any): Promise<void> {
  setup.config.storage = {};
  ensureLocationSet(setup.projectLocation, "Cloud Storage");

  logger.info();
  logger.info("Firebase Storage Security Rules allow you to define how and when to allow");
  logger.info("uploads and downloads. You can keep these rules in your project directory");
  logger.info("and publish them with " + clc.bold("firebase deploy") + ".");
  logger.info();

  const storageRulesFile = await promptOnce({
    type: "input",
    name: "rules",
    message: "What file should be used for Storage Rules?",
    default: "storage.rules",
  });
  setup.config.storage.rules = storageRulesFile;
  await config.askWriteProjectFile(setup.config.storage.rules, RULES_TEMPLATE);
}
