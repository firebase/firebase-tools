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

import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { Command } from "../command";
import { needProjectId } from "../projectUtils";
import { logPrefix } from "../extensions/extensionsHelper";
import { listExtensions } from "../extensions/listExtensions";
import { requirePermissions } from "../requirePermissions";
import { logger } from "../logger";
import * as utils from "../utils";
import { CommanderStatic } from "commander";

export const command = new Command("ext")
  .description(
    "display information on how to use ext commands and extensions installed to your project"
  )
  .before(checkMinRequiredVersion, "extMinVersion")
  .action(async (options: any) => {
    // Print out help info for all extensions commands.
    utils.logLabeledBullet(logPrefix, "list of extensions commands:");
    const firebaseTools = require("../"); // eslint-disable-line @typescript-eslint/no-var-requires
    const commandNames = [
      "ext:install",
      "ext:info",
      "ext:list",
      "ext:configure",
      "ext:update",
      "ext:uninstall",
    ];

    for (const commandName of commandNames) {
      const command: CommanderStatic = firebaseTools.getCommand(commandName);
      logger.info(clc.bold("\n" + command.name()));
      command.outputHelp();
    }
    logger.info();

    // Print out a list of all extension instances on project, if called with a project.
    try {
      await requirePermissions(options, ["firebaseextensions.instances.list"]);
      const projectId = needProjectId(options);
      return listExtensions(projectId);
    } catch (err: any) {
      return;
    }
  });
