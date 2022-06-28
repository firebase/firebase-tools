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

import { Command } from "../command";
import { FirebaseError } from "../error";
import * as args from "../deploy/functions/args";
import { needProjectId } from "../projectUtils";
import { Options } from "../options";
import { requirePermissions } from "../requirePermissions";
import * as backend from "../deploy/functions/backend";
import { logger } from "../logger";
import Table = require("cli-table");

export const command = new Command("functions:list")
  .description("list all deployed functions in your Firebase project")
  .before(requirePermissions, ["cloudfunctions.functions.list"])
  .action(async (options: Options) => {
    try {
      const context = {
        projectId: needProjectId(options),
      } as args.Context;
      const existing = await backend.existingBackend(context);
      const endpointsList = backend.allEndpoints(existing).sort(backend.compareFunctions);
      const table = new Table({
        head: ["Function", "Version", "Trigger", "Location", "Memory", "Runtime"],
        style: { head: ["yellow"] },
      });
      for (const endpoint of endpointsList) {
        const trigger = backend.endpointTriggerType(endpoint);
        const availableMemoryMb = endpoint.availableMemoryMb || "---";
        const entry = [
          endpoint.id,
          endpoint.platform === "gcfv2" ? "v2" : "v1",
          trigger,
          endpoint.region,
          availableMemoryMb,
          endpoint.runtime,
        ];
        table.push(entry);
      }
      logger.info(table.toString());
      return endpointsList;
    } catch (err: any) {
      throw new FirebaseError("Failed to list functions", {
        exit: 1,
        original: err,
      });
    }
  });
