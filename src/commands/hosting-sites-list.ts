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

import { bold } from "cli-color";
import Table = require("cli-table");

import { Command } from "../command";
import { Site, listSites } from "../hosting/api";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import { logger } from "../logger";

const TABLE_HEAD = ["Site ID", "Default URL", "App ID (if set)"];

export const command = new Command("hosting:sites:list")
  .description("list Firebase Hosting sites")
  .before(requirePermissions, ["firebasehosting.sites.get"])
  .action(
    async (
      options: any // eslint-disable-line @typescript-eslint/no-explicit-any
    ): Promise<{ sites: Site[] }> => {
      const projectId = needProjectId(options);
      const sites = await listSites(projectId);
      const table = new Table({ head: TABLE_HEAD, style: { head: ["green"] } });
      for (const site of sites) {
        const siteId = site.name.split("/").pop();
        table.push([siteId, site.defaultUrl, site.appId || "--"]);
      }

      logger.info();
      logger.info(`Sites for project ${bold(projectId)}`);
      logger.info();
      logger.info(table.toString());

      return { sites };
    }
  );
