import * as Table from "cli-table3";

import { Command } from "../command";
import {
  CrashlyticsCommandOptions,
  requireAppId,
  writeOutputFileIfRequested,
} from "../crashlytics/commandUtils";
import { listReports } from "../crashlytics/reports";
import { ListReportsResponse, Report } from "../crashlytics/types";
import { logger } from "../logger";
import { requireAuth } from "../requireAuth";

/** Returns the short report ID (e.g. `topIssues`) from a report resource name. */
function shortReportId(report: Report): string {
  return report.name?.split("/").pop() || "";
}

export const command = new Command("crashlytics:reports:list")
  .description("list the Crashlytics reports available for an app")
  .option("--app <appId>", "the Firebase App ID")
  .option("-o, --output <path>", "write raw JSON output to a file")
  .withForce("overwrite output file without prompting")
  .before(requireAuth)
  .action(async (options: CrashlyticsCommandOptions): Promise<ListReportsResponse> => {
    const appId = requireAppId(options);
    const response = await listReports(appId);

    if (await writeOutputFileIfRequested(response, options)) {
      return response;
    }

    const reports = response.reports || [];
    if (reports.length === 0) {
      logger.info(`No Crashlytics reports are available for app ${appId}.`);
      return response;
    }

    const table = new Table({
      head: ["Report", "Display Name", "Usage"],
      style: { head: ["green"] },
      colWidths: [22, 24, 60],
      wordWrap: true,
    });
    for (const report of reports) {
      table.push([shortReportId(report), report.displayName || "", report.usage || ""]);
    }
    logger.info(table.toString());
    logger.info(`Run 'firebase crashlytics:reports:get --app ${appId} <report>' to get a report.`);

    return response;
  });
