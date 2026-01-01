import * as clc from "colorette";
import * as Table from "cli-table3";

import { Command } from "../command";
import { FirebaseError } from "../error";
import { Options } from "../options";
import { logger } from "../logger";
import { requireAuth } from "../requireAuth";
import { getReport, CrashlyticsReport } from "../crashlytics/reports";
import { EventFilter, validateEventFilters } from "../crashlytics/filters";

interface CommandOptions extends Options {
  app?: string;
  pageSize?: number;
  issueId?: string;
  issueVariantId?: string;
  errorType?: string[];
  appVersion?: string[];
  startTime?: string;
  endTime?: string;
}

const VALID_REPORTS = [
  "TOP_ISSUES",
  "TOP_VARIANTS",
  "TOP_VERSIONS",
  "TOP_OPERATING_SYSTEMS",
  "TOP_ANDROID_DEVICES",
  "TOP_APPLE_DEVICES",
];

const REPORT_NAME_MAP: Record<string, CrashlyticsReport> = {
  TOP_ISSUES: CrashlyticsReport.TOP_ISSUES,
  TOP_VARIANTS: CrashlyticsReport.TOP_VARIANTS,
  TOP_VERSIONS: CrashlyticsReport.TOP_VERSIONS,
  TOP_OPERATING_SYSTEMS: CrashlyticsReport.TOP_OPERATING_SYSTEMS,
  TOP_ANDROID_DEVICES: CrashlyticsReport.TOP_ANDROID_DEVICES,
  TOP_APPLE_DEVICES: CrashlyticsReport.TOP_APPLE_DEVICES,
};

export const command = new Command("crashlytics:reports:get <report>")
  .description(
    "get a Crashlytics report (TOP_ISSUES, TOP_VARIANTS, TOP_VERSIONS, TOP_OPERATING_SYSTEMS, TOP_ANDROID_DEVICES, TOP_APPLE_DEVICES)",
  )
  .before(requireAuth)
  .option("--app <appId>", "the app id of your Firebase app")
  .option("--page-size <number>", "number of rows to return", 10)
  .option("--issue-id <issueId>", "filter by issue id")
  .option("--issue-variant-id <variantId>", "filter by issue variant id")
  .option("--error-type <types...>", "filter by error type (FATAL, NON_FATAL, ANR)")
  .option("--app-version <versions...>", "filter by app version display names")
  .option("--start-time <timestamp>", "filter start time (ISO 8601 format)")
  .option("--end-time <timestamp>", "filter end time (ISO 8601 format)")
  .action(async (report: string, options: CommandOptions) => {
    if (!options.app) {
      throw new FirebaseError(
        "set --app <appId> to a valid Firebase application id, e.g. 1:00000000:android:0000000",
      );
    }

    const reportUpper = report.toUpperCase();
    if (!VALID_REPORTS.includes(reportUpper)) {
      throw new FirebaseError(`Invalid report type. Must be one of: ${VALID_REPORTS.join(", ")}`);
    }

    const filter: EventFilter = {};
    if (options.issueId) {
      filter.issueId = options.issueId;
    }
    if (options.issueVariantId) {
      filter.issueVariantId = options.issueVariantId;
    }
    if (options.errorType) {
      filter.issueErrorTypes = options.errorType as ("FATAL" | "NON_FATAL" | "ANR")[];
    }
    if (options.appVersion) {
      filter.versionDisplayNames = options.appVersion;
    }
    if (options.startTime) {
      filter.intervalStartTime = options.startTime;
    }
    if (options.endTime) {
      filter.intervalEndTime = options.endTime;
    }

    const validatedFilter = validateEventFilters(filter);
    const pageSize = options.pageSize ?? 10;
    const reportType = REPORT_NAME_MAP[reportUpper];

    const result = await getReport(reportType, options.app, validatedFilter, pageSize);

    // Display table output
    if (result.groups && result.groups.length > 0) {
      logger.info(`\n${result.displayName || reportUpper}`);
      logger.info("");

      if (reportUpper === "TOP_ISSUES") {
        const table = new Table({
          head: ["Issue", "Type", "Events", "Users", "State"],
          style: { head: ["green"] },
        });
        for (const group of result.groups) {
          const issue = group.issue;
          const metrics = group.metrics?.[0];
          table.push([
            issue?.title || issue?.id || "-",
            issue?.errorType || "-",
            metrics?.eventsCount?.toLocaleString() || "0",
            metrics?.impactedUsersCount?.toLocaleString() || "0",
            issue?.state || "-",
          ]);
        }
        logger.info(table.toString());
      } else if (reportUpper === "TOP_VARIANTS") {
        const table = new Table({
          head: ["Variant ID", "Events", "Users"],
          style: { head: ["green"] },
        });
        for (const group of result.groups) {
          const variant = group.variant;
          const metrics = group.metrics?.[0];
          table.push([
            variant?.id || "-",
            metrics?.eventsCount?.toLocaleString() || "0",
            metrics?.impactedUsersCount?.toLocaleString() || "0",
          ]);
        }
        logger.info(table.toString());
      } else if (reportUpper === "TOP_VERSIONS") {
        const table = new Table({
          head: ["Version", "Events", "Users"],
          style: { head: ["green"] },
        });
        for (const group of result.groups) {
          const version = group.version;
          const metrics = group.metrics?.[0];
          table.push([
            version?.displayName || "-",
            metrics?.eventsCount?.toLocaleString() || "0",
            metrics?.impactedUsersCount?.toLocaleString() || "0",
          ]);
        }
        logger.info(table.toString());
      } else if (reportUpper === "TOP_OPERATING_SYSTEMS") {
        const table = new Table({
          head: ["Operating System", "Events", "Users"],
          style: { head: ["green"] },
        });
        for (const group of result.groups) {
          const os = group.operatingSystem;
          const metrics = group.metrics?.[0];
          table.push([
            os?.displayName || "-",
            metrics?.eventsCount?.toLocaleString() || "0",
            metrics?.impactedUsersCount?.toLocaleString() || "0",
          ]);
        }
        logger.info(table.toString());
      } else if (reportUpper === "TOP_ANDROID_DEVICES" || reportUpper === "TOP_APPLE_DEVICES") {
        const table = new Table({
          head: ["Device", "Events", "Users"],
          style: { head: ["green"] },
        });
        for (const group of result.groups) {
          const device = group.device;
          const metrics = group.metrics?.[0];
          table.push([
            device?.marketingName || device?.displayName || "-",
            metrics?.eventsCount?.toLocaleString() || "0",
            metrics?.impactedUsersCount?.toLocaleString() || "0",
          ]);
        }
        logger.info(table.toString());
      }

      logger.info(`\n${result.groups.length} result(s).`);
    } else {
      logger.info(clc.bold("No results found."));
    }

    return result;
  });
