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

export const command = new Command("database:settings:get <path>")
  .description("read the realtime database setting at path")
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, uses default database instance)"
  )
  .help(HELP_TEXT)
  .before(requirePermissions, ["firebasedatabase.instances.get"])
  .before(requireDatabaseInstance)
  .before(populateInstanceDetails)
  .before(warnEmulatorNotSupported, Emulators.DATABASE)
  .action(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (path: string, options: any): Promise<void> => {
      if (!DATABASE_SETTINGS.has(path)) {
        throw new FirebaseError(INVALID_PATH_ERROR, { exit: 1 });
      }
      const u = new URL(
        utils.getDatabaseUrl(
          realtimeOriginOrCustomUrl(options.instanceDetails.databaseUrl),
          options.instance,
          `/.settings/${path}.json`
        )
      );
      const c = new Client({ urlPrefix: u.origin, auth: true });
      let res;
      try {
        res = await c.get(u.pathname);
      } catch (err: any) {
        throw new FirebaseError(`Unexpected error fetching configs at ${path}`, {
          exit: 2,
          original: err,
        });
      }
      // strictTriggerValidation returns an object, not a single string.
      // Check for an object and get the `value` from it.
      if (typeof res.body === "object") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        res.body = (res.body as any).value;
      }
      utils.logSuccess(`For database instance ${options.instance}\n\t ${path} = ${res.body}`);
    }
  );
