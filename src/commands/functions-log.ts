import * as opn from "open";
import { URLSearchParams } from "url";

import { Command } from "../command";
import { FirebaseError } from "../error";
import { logger } from "../logger";
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
      const filterParams = new URLSearchParams(apiFilter);
      const url = `https://console.developers.google.com/logs/viewer?advancedFilter=${filterParams.toString()}&project=${projectId}`;

      if (options.open) {
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
      logger.info(`\nSee full logs at: ${url}`);
      return entries;
    } catch (err: any) {
      throw new FirebaseError(`Failed to list log entries ${err.message}`, { exit: 1 });
    }
  });
