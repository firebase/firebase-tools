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
import { requireDatabaseInstance } from "../requireDatabaseInstance";
import { requirePermissions } from "../requirePermissions";
import DatabaseRemove from "../database/remove";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { populateInstanceDetails } from "../management/database";
import { realtimeOriginOrEmulatorOrCustomUrl } from "../database/api";
import * as utils from "../utils";
import { promptOnce } from "../prompt";
import * as clc from "cli-color";

export const command = new Command("database:remove <path>")
  .description("remove data from your Firebase at the specified path")
  .option("-f, --force", "pass this option to bypass confirmation prompt")
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, use default database instance)"
  )
  .before(requirePermissions, ["firebasedatabase.instances.update"])
  .before(requireDatabaseInstance)
  .before(populateInstanceDetails)
  .before(warnEmulatorNotSupported, Emulators.DATABASE)
  .action(async (path: string, options) => {
    if (!path.startsWith("/")) {
      return utils.reject("Path must begin with /", { exit: 1 });
    }
    const origin = realtimeOriginOrEmulatorOrCustomUrl(options.instanceDetails.databaseUrl);
    const databaseUrl = utils.getDatabaseUrl(origin, options.instance, path);
    const confirm = await promptOnce(
      {
        type: "confirm",
        name: "force",
        default: false,
        message: "You are about to remove all data at " + clc.cyan(databaseUrl) + ". Are you sure?",
      },
      options
    );
    if (!confirm) {
      return utils.reject("Command aborted.", { exit: 1 });
    }

    const removeOps = new DatabaseRemove(options.instance, path, origin);
    await removeOps.execute();
    utils.logSuccess("Data removed successfully");
  });
