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

import { Client } from "../apiv2";
import { Command } from "../command";
import { Emulators } from "../emulator/types";
import { FirebaseError } from "../error";
import { populateInstanceDetails } from "../management/database";
import { printNoticeIfEmulated } from "../emulator/commandUtils";
import { realtimeOriginOrEmulatorOrCustomUrl } from "../database/api";
import { requirePermissions } from "../requirePermissions";
import { URL } from "url";
import { logger } from "../logger";
import { requireDatabaseInstance } from "../requireDatabaseInstance";
import * as utils from "../utils";

export const command = new Command("database:push <path> [infile]")
  .description("add a new JSON object to a list of data in your Firebase")
  .option("-d, --data <data>", "specify escaped JSON directly")
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, use default database instance)"
  )
  .before(requirePermissions, ["firebasedatabase.instances.update"])
  .before(requireDatabaseInstance)
  .before(populateInstanceDetails)
  .before(printNoticeIfEmulated, Emulators.DATABASE)
  .action(async (path: string, infile, options) => {
    if (!path.startsWith("/")) {
      throw new FirebaseError("Path must begin with /");
    }
    const inStream =
      utils.stringToStream(options.data) || (infile ? fs.createReadStream(infile) : process.stdin);
    const origin = realtimeOriginOrEmulatorOrCustomUrl(options.instanceDetails.databaseUrl);
    const u = new URL(utils.getDatabaseUrl(origin, options.instance, path + ".json"));

    if (!infile && !options.data) {
      utils.explainStdin();
    }
    logger.debug(`Database URL: ${u}`);

    const c = new Client({ urlPrefix: u.origin, auth: true });
    let res;
    try {
      res = await c.request<NodeJS.ReadableStream, { name: string }>({
        method: "POST",
        path: u.pathname,
        body: inStream,
      });
    } catch (err: any) {
      logger.debug(err);
      throw new FirebaseError(`Unexpected error while pushing data: ${err}`, { exit: 2 });
    }

    if (!path.endsWith("/")) {
      path += "/";
    }

    const consoleUrl = utils.getDatabaseViewDataUrl(
      origin,
      options.project,
      options.instance,
      path + res.body.name
    );

    utils.logSuccess("Data pushed successfully");
    logger.info();
    logger.info(clc.bold("View data at:"), consoleUrl);
    return { key: res.body.name };
  });
