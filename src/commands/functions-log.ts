import * as _ from "lodash";
import * as opn from "open";
import * as qs from "querystring";

import { Command } from "../command";
import { FirebaseError } from "../error";
import * as gcp from "../gcp";
import * as getProjectId from "../getProjectId";
import * as logger from "../logger";
import { requirePermissions } from "../requirePermissions";

module.exports = new Command("functions:log")
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
      const projectId = getProjectId(options, false);
      let apiFilter = `resource.type="cloud_function"`;
      if (options.only) {
        const funcNames = options.only.split(",");
        const apiFuncFilters = _.map(funcNames, (funcName) => {
          return `resource.labels.function_name="${funcName}"`;
        });
        apiFilter += `\n(${apiFuncFilters.join(" OR ")})`;
      }
      if (options.open) {
        const url = `https://console.developers.google.com/logs/viewer?advancedFilter=${qs.escape(
          apiFilter
        )}&project=${projectId}`;
        opn(url);
        return;
      }
      const entries = await gcp.cloudlogging.listEntries(
        projectId,
        apiFilter,
        options.lines || 35,
        "desc"
      );
      for (let i = _.size(entries) - 1; i >= 0; i--) {
        const entry = entries[i];
        logger.info(
          entry.timestamp,
          _.get(entry, "severity", "?").substring(0, 1),
          _.get(entry, "resource.labels.function_name") + ":",
          _.get(entry, "textPayload", "")
        );
      }
      if (_.isEmpty(entries)) {
        logger.info("No log entries found.");
      }
      return entries;
    } catch (err) {
      throw new FirebaseError(`Failed to list log entries ${err.message}`, { exit: 1 });
    }
  });
