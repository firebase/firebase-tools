import * as opn from "open";
import * as qs from "querystring";

import { Command } from "../command";
import { FirebaseError } from "../error";
import * as cloudlogging from "../gcp/cloudlogging";
import * as firestoreLog from "../firestore/firestoreLog";
import { needProjectId } from "../projectUtils";
import { requirePermissions } from "../requirePermissions";

export const command = new Command("firestore:log")
  .description("read logs from deployed functions")
  .option("-n, --lines <num_lines>", "specify number of log lines to fetch")
  .option("--open", "open logs page in web browser")
  .before(requirePermissions, ["logging.logs.list", "logging.logEntries.list", "logging.privateLogEntries.list"])
  .action(async (options: any) => {
    try {
      const projectId = needProjectId(options);
      const apiFilter = firestoreLog.getApiFilter();
      console.log(apiFilter);
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
      firestoreLog.logEntries(entries);
      return entries;
    } catch (err: any) {
      throw new FirebaseError(`Failed to list log entries ${err.message}`, { exit: 1 });
    }
  });
