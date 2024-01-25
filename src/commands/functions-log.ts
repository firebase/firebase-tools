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
    'only show logs of specified, comma-seperated functions (e.g. "funcA,funcB")',
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
          apiFilter,
        )}&project=${projectId}`;
        opn(url);
        return;
      }
      const entries = await cloudlogging.listEntries(
        projectId,
        apiFilter,
        options.lines || 35,
        "desc",
      );
      functionsLog.logEntries(entries);
      return entries;
    } catch (err: any) {
      throw new FirebaseError(`Failed to list log entries ${err.message}`, { exit: 1 });
    }
  });
