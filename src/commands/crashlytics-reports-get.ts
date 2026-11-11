import * as Table from "cli-table3";

import { Command } from "../command";
import {
  CrashlyticsFilterCommandOptions,
  parseEventFilters,
  parsePositiveIntOption,
  requireAppId,
  withEventFilterOptions,
  writeOutputFileIfRequested,
} from "../crashlytics/commandUtils";
import { getReport } from "../crashlytics/reports";
import { IntervalMetrics, Report, ReportGroup } from "../crashlytics/types";
import { FirebaseError, getErrMsg, getError } from "../error";
import { logger } from "../logger";
import { requireAuth } from "../requireAuth";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const MAX_CELL_LENGTH = 60;

/** Reports that are always scoped to a single issue and require `--issue-id`. */
export const REPORTS_REQUIRING_ISSUE_ID = ["topVariants", "topBrowsers", "topCustomKeys"];

export interface ReportsGetOptions extends CrashlyticsFilterCommandOptions {
  limit?: string | number;
}

interface Dimension {
  headers: string[];
  cells: (group: ReportGroup) => string[];
  hasSampleEvents?: boolean;
}

interface MetricColumn {
  header: string;
  value: (metrics: IntervalMetrics) => number | string | undefined;
  percent?: boolean;
  always?: boolean;
}

const METRIC_COLUMNS: MetricColumn[] = [
  { header: "Events", value: (m) => m.eventsCount, always: true },
  { header: "Impacted Users", value: (m) => m.impactedUsersCount, always: true },
  { header: "Impacted Sessions", value: (m) => m.impactedSessionsCount },
  { header: "Total Users", value: (m) => m.totalUsersCount },
  { header: "Total Sessions", value: (m) => m.totalSessionsCount },
  { header: "Crash-Free Users", value: (m) => m.crashFreeUsersPercentage, percent: true },
  { header: "Crash-Free Sessions", value: (m) => m.crashFreeSessionsPercentage, percent: true },
];

function truncate(value?: string, max = MAX_CELL_LENGTH): string {
  if (!value) {
    return "";
  }
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Returns the short event ID from a sampleEvent resource name, for use with `crashlytics:events:get`. */
function shortEventId(sampleEvent?: string): string {
  return sampleEvent?.split("/").pop()?.split("?")[0] || "";
}

function dimensionFor(group?: ReportGroup): Dimension {
  if (group?.issue) {
    return {
      headers: ["Issue ID", "Title", "Error Type", "Sample Event"],
      cells: (g) => [
        g.issue?.id || "",
        truncate(g.issue?.title),
        g.issue?.errorType || "",
        shortEventId(g.issue?.sampleEvent),
      ],
      hasSampleEvents: true,
    };
  }
  if (group?.variant) {
    return {
      headers: ["Variant ID", "Sample Event"],
      cells: (g) => [g.variant?.id || "", shortEventId(g.variant?.sampleEvent)],
      hasSampleEvents: true,
    };
  }
  if (group?.version) {
    return {
      headers: ["Version"],
      cells: (g) => {
        const label = g.version?.displayName || g.version?.displayVersion || "";
        const tracks = (g.version?.tracks || []).map((t) => t.title).filter(Boolean);
        return [tracks.length ? `${label} [${tracks.join(", ")}]` : label];
      },
    };
  }
  if (group?.operatingSystem) {
    return { headers: ["Operating System"], cells: (g) => [g.operatingSystem?.displayName || ""] };
  }
  if (group?.device) {
    return { headers: ["Device"], cells: (g) => [g.device?.displayName || ""] };
  }
  if (group?.browser) {
    return { headers: ["Browser"], cells: (g) => [g.browser?.displayName || ""] };
  }
  if (group?.customAttribute) {
    return {
      headers: ["Key", "Value"],
      cells: (g) => [g.customAttribute?.key || "", truncate(g.customAttribute?.value)],
    };
  }
  if (group?.webMetricsGroup) {
    return { headers: ["Group"], cells: (g) => [g.webMetricsGroup?.id || ""] };
  }
  // Ungrouped reports such as appSummary only have metrics.
  return { headers: [], cells: () => [] };
}

function formatMetric(column: MetricColumn, metrics?: IntervalMetrics): string {
  const raw = metrics ? column.value(metrics) : undefined;
  if (raw === undefined) {
    return column.always ? "0" : "-";
  }
  return column.percent ? `${Number(raw).toFixed(2)}%` : String(raw);
}

function logReport(report: Report, appId: string, limit: number): void {
  const groups = report.groups || [];
  const dimension = dimensionFor(groups[0]);
  const metricColumns = METRIC_COLUMNS.filter(
    (col) =>
      col.always ||
      groups.some((g) => g.metrics?.[0] !== undefined && col.value(g.metrics[0]) !== undefined),
  );

  const table = new Table({
    head: [...dimension.headers, ...metricColumns.map((c) => c.header)],
    style: { head: ["green"] },
  });
  for (const group of groups) {
    table.push([
      ...dimension.cells(group),
      ...metricColumns.map((c) => formatMetric(c, group.metrics?.[0])),
    ]);
  }

  if (report.displayName) {
    logger.info(report.displayName);
  }
  logger.info(table.toString());

  const totalSize = Number(report.totalSize || 0);
  if (totalSize > groups.length && limit < MAX_LIMIT) {
    logger.info(
      `Showing ${groups.length} of ${totalSize} groups. Use '--limit <number>' to show more (up to ${MAX_LIMIT}).`,
    );
  }
  if (dimension.hasSampleEvents) {
    logger.info(
      `Run 'firebase crashlytics:events:get --app ${appId} <sampleEvent>' to inspect a sample event.`,
    );
  }
}

export const command = withEventFilterOptions(new Command("crashlytics:reports:get <report>"))
  .description("get a Crashlytics report, such as top issues or top versions")
  .option("--app <appId>", "the Firebase App ID")
  .option(
    "-n, --limit <number>",
    `maximum number of groups to return (1-${MAX_LIMIT}, default: ${DEFAULT_LIMIT})`,
  )
  .option("-o, --output <path>", "write raw JSON output to a file")
  .withForce("overwrite output file without prompting")
  .help(
    `Gets a Crashlytics report: event, user, and session counts grouped by a dimension such as
issue, version, operating system, device, browser, or custom key.

Available reports differ between Android/Apple and web apps. Run
'firebase crashlytics:reports:list --app <appId>' to see the reports for your app.

--issue-id is required for the topVariants, topBrowsers, and topCustomKeys reports,
not supported for topIssues (use 'crashlytics:issues:get' instead), and optional for all other reports.

Examples:
  firebase crashlytics:reports:get --app <appId> topIssues
  firebase crashlytics:reports:get --app <appId> --limit 5 --error-types FATAL topIssues
  firebase crashlytics:reports:get --app <appId> --issue-id <issueId> topVariants
  firebase crashlytics:reports:get --app <appId> --start-time 2026-11-01T00:00:00Z appSummary`,
  )
  .before(requireAuth)
  .action(async (reportName: string, options: ReportsGetOptions): Promise<Report> => {
    const appId = requireAppId(options);
    const report = typeof reportName === "string" ? reportName.trim() : "";
    if (!report) {
      throw new FirebaseError(
        `Must specify '<report>'. Run 'firebase crashlytics:reports:list --app ${appId}' to see available reports.`,
        { exit: 1 },
      );
    }
    const limit = parsePositiveIntOption(options.limit, "--limit", {
      defaultValue: DEFAULT_LIMIT,
      max: MAX_LIMIT,
    });
    const filter = parseEventFilters(options, appId);
    if (REPORTS_REQUIRING_ISSUE_ID.includes(report) && !filter?.issueId) {
      throw new FirebaseError(
        `The '${report}' report requires '--issue-id <id>'. Run 'firebase crashlytics:reports:get --app ${appId} topIssues' to find issue IDs.`,
        { exit: 1 },
      );
    }

    if (report === "topIssues" && filter?.issueId) {
      throw new FirebaseError(
        `The 'topIssues' report does not support '--issue-id'. Run 'firebase crashlytics:issues:get --app ${appId} ${filter.issueId}' to inspect a single issue.`,
        { exit: 1 },
      );
    }

    let response: Report;
    try {
      response = await getReport(report, appId, filter, limit);
    } catch (err: unknown) {
      const message = getErrMsg(err);
      if (message.startsWith("Invalid Crashlytics report")) {
        throw new FirebaseError(
          `${message}\nRun 'firebase crashlytics:reports:list --app ${appId}' for report descriptions.`,
          { exit: 1, original: getError(err) },
        );
      }
      throw err;
    }

    if (await writeOutputFileIfRequested(response, options)) {
      return response;
    }
    if (!response.groups?.length) {
      logger.info(`No results for the '${report}' report with the given filters.`);
      return response;
    }
    logReport(response, appId, limit);
    return response;
  });
