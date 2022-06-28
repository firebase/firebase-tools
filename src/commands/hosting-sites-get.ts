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

import Table = require("cli-table");

import { Command } from "../command";
import { Site, getSite } from "../hosting/api";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import { logger } from "../logger";
import { FirebaseError } from "../error";

export const command = new Command("hosting:sites:get <siteId>")
  .description("print info about a Firebase Hosting site")
  .before(requirePermissions, ["firebasehosting.sites.get"])
  .action(async (siteId: string, options): Promise<Site> => {
    const projectId = needProjectId(options);
    if (!siteId) {
      throw new FirebaseError("<siteId> must be specified");
    }
    const site = await getSite(projectId, siteId);
    const table = new Table();
    table.push(["Site ID:", site.name.split("/").pop()]);
    table.push(["Default URL:", site.defaultUrl]);
    table.push(["App ID:", site.appId || ""]);
    // table.push(["Labels:", JSON.stringify(site.labels)]);

    logger.info();
    logger.info(table.toString());

    return site;
  });
