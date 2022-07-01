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

import * as opn from "open";
import * as qs from "querystring";

import { Command } from "../command";
import { FirebaseError } from "../error";
import * as cloudlogging from "../gcp/cloudlogging";
import * as functionsLog from "../functions/functionslog";
import { needProjectId } from "../projectUtils";
import { requirePermissions } from "../requirePermissions";

export const command = new Command("functions:log")
  .description("read logs from deployed functions")
  .option(
    "--only <function_names>",
    'only show logs of specified, comma-seperated functions (e.g. "funcA,funcB")'
  )
  .option("-n, --lines <num_lines>", "specify number of log lines to fetch")
  .option("--open", "open logs page in web browser")
  .before(requirePermissions, ["logging.logEntries.list", "logging.logs.list"])
  .action(async (options: any) => {
    try {
      const projectId = needProjectId(options);
      const apiFilter = functionsLog.getApiFilter(options.only);
      if (options.open) {
        const url = `https://console.developers.google.com/logs/viewer?advancedFilter=${qs.escape(
          apiFilter
        )}&project=${projectId}`;
        opn(url);
        return;
      }
      const entries = await cloudlogging.listEntries(
        projectId,
        apiFilter,
        options.lines || 35,
        "desc"
      );
      functionsLog.logEntries(entries);
      return entries;
    } catch (err: any) {
      throw new FirebaseError(`Failed to list log entries ${err.message}`, { exit: 1 });
    }
  });
