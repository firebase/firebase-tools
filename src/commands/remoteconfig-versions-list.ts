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

import { logger } from "../logger";
import * as rcVersion from "../remoteconfig/versionslist";
import { Command } from "../command";
import { needProjectId } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import { Version, ListVersionsResult } from "../remoteconfig/interfaces";
import { datetimeString } from "../utils";

import Table = require("cli-table");

const tableHead = ["Update User", "Version Number", "Update Time"];

function pushTableContents(table: Table, version: Version): number {
  return table.push([
    version.updateUser?.email,
    version.versionNumber,
    version.updateTime ? datetimeString(new Date(version.updateTime)) : "",
  ]);
}

export const command = new Command("remoteconfig:versions:list")
  .description(
    "get a list of Remote Config template versions that have been published for a Firebase project"
  )
  .option(
    "--limit <maxResults>",
    "limit the number of versions being returned. Pass '0' to fetch all versions."
  )
  .before(requireAuth)
  .before(requirePermissions, ["cloudconfig.configs.get"])
  .action(async (options) => {
    const versionsList: ListVersionsResult = await rcVersion.getVersions(
      needProjectId(options),
      options.limit
    );
    const table = new Table({ head: tableHead, style: { head: ["green"] } });
    for (let item = 0; item < versionsList.versions.length; item++) {
      pushTableContents(table, versionsList.versions[item]);
    }
    logger.info(table.toString());
    return versionsList;
  });
