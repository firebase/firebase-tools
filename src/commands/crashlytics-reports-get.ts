import * as clc from "colorette";
import * as Table from "cli-table3";

import { Command } from "../command";
import { FirebaseError } from "../error";
import { Options } from "../options";
import { logger } from "../logger";
import { requireAuth } from "../requireAuth";
import { getReport, CrashlyticsReport } from "../crashlytics/reports";
import { EventFilter, validateEventFilters } from "../crashlytics/filters";
import { requireAppId } from "../crashlytics/utils";
import { ReportGroup } from "../crashlytics/types";

interface CommandOptions extends Options {
  app?: string;
  pageSize?: number;
  issueId?: string;
  issueVariantId?: string;
  issueType?: string[];
  appVersion?: string[];
  startTime?: string;
  endTime?: string;
}

interface ReportTableConfig {
  headers: string[];
  getRow: (group: ReportGroup) => string[];
}

const VALID_ISSUE_TYPES = ["FATAL", "NON_FATAL", "ANR"] as const;

const REPORT_CONFIG: Record<string, { report: CrashlyticsReport; table: ReportTableConfig }> = {
  TOP_ISSUES: {
    report: CrashlyticsReport.TOP_ISSUES,
    table: {
      headers: ["Issue", "Type", "Events", "Users", "State"],
      getRow: (group) => {
        const issue = group.issue;
        const metrics = group.metrics?.[0];
        return [
          issue?.title || issue?.id || "-",
          issue?.errorType || "-",
          metrics?.eventsCount?.toLocaleString() || "0",
          metrics?.impactedUsersCount?.toLocaleString() || "0",
          issue?.state || "-",
        ];
      },
    },
  },
  TOP_VARIANTS: {
    report: CrashlyticsReport.TOP_VARIANTS,
    table: {
      headers: ["Variant ID", "Events", "Users"],
      getRow: (group) => {
        const variant = group.variant;
        const metrics = group.metrics?.[0];
        return [
          variant?.id || "-",
          metrics?.eventsCount?.toLocaleString() || "0",
          metrics?.impactedUsersCount?.toLocaleString() || "0",
        ];
      },
    },
  },
  TOP_VERSIONS: {
    report: CrashlyticsReport.TOP_VERSIONS,
    table: {
      headers: ["Version", "Events", "Users"],
      getRow: (group) => {
        const version = group.version;
        const metrics = group.metrics?.[0];
        return [
          version?.displayName || "-",
          metrics?.eventsCount?.toLocaleString() || "0",
          metrics?.impactedUsersCount?.toLocaleString() || "0",
        ];
      },
    },
  },
  TOP_OPERATING_SYSTEMS: {
    report: CrashlyticsReport.TOP_OPERATING_SYSTEMS,
    table: {
      headers: ["Operating System", "Events", "Users"],
      getRow: (group) => {
        const os = group.operatingSystem;
        const metrics = group.metrics?.[0];
        return [
          os?.displayName || "-",
          metrics?.eventsCount?.toLocaleString() || "0",
          metrics?.impactedUsersCount?.toLocaleString() || "0",
        ];
      },
    },
  },
  TOP_ANDROID_DEVICES: {
    report: CrashlyticsReport.TOP_ANDROID_DEVICES,
    table: {
      headers: ["Device", "Events", "Users"],
      getRow: (group) => {
        const device = group.device;
        const metrics = group.metrics?.[0];
        return [
          device?.marketingName || device?.displayName || "-",
          metrics?.eventsCount?.toLocaleString() || "0",
          metrics?.impactedUsersCount?.toLocaleString() || "0",
        ];
      },
    },
  },
  TOP_APPLE_DEVICES: {
    report: CrashlyticsReport.TOP_APPLE_DEVICES,
    table: {
      headers: ["Device", "Events", "Users"],
      getRow: (group) => {
        const device = group.device;
        const metrics = group.metrics?.[0];
        return [
          device?.marketingName || device?.displayName || "-",
          metrics?.eventsCount?.toLocaleString() || "0",
          metrics?.impactedUsersCount?.toLocaleString() || "0",
        ];
      },
    },
  },
};

const VALID_REPORTS = Object.keys(REPORT_CONFIG);

export const command = new Command("crashlytics:reports:get <report>")
  .description(
    "get a Crashlytics report (TOP_ISSUES, TOP_VARIANTS, TOP_VERSIONS, TOP_OPERATING_SYSTEMS, TOP_ANDROID_DEVICES, TOP_APPLE_DEVICES)",
  )
  .before(requireAuth)
  .option("--app <appId>", "the app id of your Firebase app")
  .option("--page-size <number>", "number of rows to return", 10)
  .option("--issue-id <issueId>", "filter by issue id")
  .option("--issue-variant-id <variantId>", "filter by issue variant id")
  .option("--issue-type <types...>", "filter by issue type (FATAL, NON_FATAL, ANR)")
  .option("--app-version <versions...>", "filter by app version display names")
  .option("--start-time <timestamp>", "filter start time (ISO 8601 format)")
  .option("--end-time <timestamp>", "filter end time (ISO 8601 format)")
  .action(async (report: string, options: CommandOptions) => {
    const appId = requireAppId(options.app);

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
    if (options.issueType) {
      const issueTypes = Array.isArray(options.issueType)
        ? options.issueType
        : [options.issueType];
      for (const issueType of issueTypes) {
        const issueTypeUpper = issueType.toUpperCase();
        if (!VALID_ISSUE_TYPES.includes(issueTypeUpper as (typeof VALID_ISSUE_TYPES)[number])) {
          throw new FirebaseError(
            `Invalid issue type "${issueType}". Must be one of: ${VALID_ISSUE_TYPES.join(", ")}`,
          );
        }
      }
      filter.issueErrorTypes = issueTypes.map((e) => e.toUpperCase()) as (
        | "FATAL"
        | "NON_FATAL"
        | "ANR"
      )[];
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
    const config = REPORT_CONFIG[reportUpper];

    const result = await getReport(config.report, appId, validatedFilter, pageSize);

    if (result.groups && result.groups.length > 0) {
      logger.info(`\n${result.displayName || reportUpper}`);
      logger.info("");

      const table = new Table({
        head: config.table.headers,
        style: { head: ["green"] },
      });
      for (const group of result.groups) {
        table.push(config.table.getRow(group));
      }
      logger.info(table.toString());
      logger.info(`\n${result.groups.length} result(s).`);
    } else {
      logger.info(clc.bold("No results found."));
    }

    return result;
  });
