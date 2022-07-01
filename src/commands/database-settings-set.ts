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

import { URL } from "url";

import { Client } from "../apiv2";
import { Command } from "../command";
import { DATABASE_SETTINGS, HELP_TEXT, INVALID_PATH_ERROR } from "../database/settings";
import { Emulators } from "../emulator/types";
import { FirebaseError } from "../error";
import { populateInstanceDetails } from "../management/database";
import { realtimeOriginOrCustomUrl } from "../database/api";
import { requirePermissions } from "../requirePermissions";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { requireDatabaseInstance } from "../requireDatabaseInstance";
import * as utils from "../utils";

export const command = new Command("database:settings:set <path> <value>")
  .description("set the realtime database setting at path.")
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, use default database instance)"
  )
  .help(HELP_TEXT)
  .before(requirePermissions, ["firebasedatabase.instances.update"])
  .before(requireDatabaseInstance)
  .before(populateInstanceDetails)
  .before(warnEmulatorNotSupported, Emulators.DATABASE)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .action(async (path: string, value: string, options: any) => {
    const setting = DATABASE_SETTINGS.get(path);
    if (setting === undefined) {
      return utils.reject(INVALID_PATH_ERROR, { exit: 1 });
    }
    const parsedValue = setting.parseInput(value);
    if (parsedValue === undefined) {
      return utils.reject(setting.parseInputErrorMessge, { exit: 1 });
    }

    const u = new URL(
      utils.getDatabaseUrl(
        realtimeOriginOrCustomUrl(options.instanceDetails.databaseUrl),
        options.instance,
        `/.settings/${path}.json`
      )
    );
    const c = new Client({ urlPrefix: u.origin, auth: true });
    try {
      await c.put(u.pathname, JSON.stringify(parsedValue));
    } catch (err: any) {
      throw new FirebaseError(`Unexpected error fetching configs at ${path}`, {
        exit: 2,
        original: err,
      });
    }
    utils.logSuccess("Successfully set setting.");
    utils.logSuccess(
      `For database instance ${options.instance}\n\t ${path} = ${JSON.stringify(parsedValue)}`
    );
  });
