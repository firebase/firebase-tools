import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import {
  CrashlyticsReport,
  getReport,
  ReportInputSchema,
  ReportInput,
} from "../../../crashlytics/reports";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// Generates the tool call fn for requesting a Crashlytics report

function getReportContent(
  report: CrashlyticsReport,
): (input: ReportInput) => Promise<CallToolResult> {
  return async ({ appId, filter, pageSize }) => {
    if (!appId) return mcpError(`Must specify 'appId' parameter.`);
    filter ??= {};
    if (!!filter.intervalStartTime && !filter.intervalEndTime) {
      // interval.end_time is required if interval.start_time is set but the agent likes to forget it
      filter.intervalEndTime = new Date().toISOString();
    }
    return toContent(await getReport(report, appId, filter, pageSize));
  };
}

// Currently, it appears to work best if the five different supported reports
// are expressed as five different tools. This allows the usage and format
// of each report to be more clearly described. In the future, it may be possible
// to consolidate all of these into a single `get_report` tool.

export const get_top_issues = tool(
  {
    name: "get_top_issues",
    description: `Counts events and distinct impacted users, grouped by *issue*.
      Groups are sorted by event count, in descending order.
      Only counts events matching the given filters.`,
    inputSchema: ReportInputSchema,
    annotations: {
      title: "Get Crashlytics Top Issues Report",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
    },
  },
  getReportContent(CrashlyticsReport.TopIssues),
);

export const get_top_variants = tool(
  {
    name: "get_top_variants",
    description: `Counts events and distinct impacted users, grouped by issue *variant*.
      Groups are sorted by event count, in descending order.
      Only counts events matching the given filters.`,
    inputSchema: ReportInputSchema,
    annotations: {
      title: "Get Crashlytics Top Variants Report",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
    },
  },
  getReportContent(CrashlyticsReport.TopVariants),
);

export const get_top_versions = tool(
  {
    name: "get_top_versions",
    description: `Counts events and distinct impacted users, grouped by *version*.
      Groups are sorted by event count, in descending order.
      Only counts events matching the given filters.`,
    inputSchema: ReportInputSchema,
    annotations: {
      title: "Get Crashlytics Top Versions Report",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
    },
  },
  getReportContent(CrashlyticsReport.TopVersions),
);

export const get_top_apple_devices = tool(
  {
    name: "get_top_apple_devices",
    description: `Counts events and distinct impacted users, grouped by apple *device*.
      Groups are sorted by event count, in descending order.
      Only counts events matching the given filters.
      Only relevant for iOS, iPadOS and MacOS applications.`,
    inputSchema: ReportInputSchema,
    annotations: {
      title: "Get Crashlytics Top Apple Devices Report",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
    },
  },
  getReportContent(CrashlyticsReport.TopAppleDevices),
);

export const get_top_android_devices = tool(
  {
    name: "get_top_android_devices",
    description: `Counts events and distinct impacted users, grouped by android *device*.
      Groups are sorted by event count, in descending order.
      Only counts events matching the given filters.
      Only relevant for Android applications.`,
    inputSchema: ReportInputSchema,
    annotations: {
      title: "Get Crashlytics Top Android Devices Report",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
    },
  },
  getReportContent(CrashlyticsReport.TopAndroidDevices),
);

export const get_top_operating_systems = tool(
  {
    name: "get_top_operating_systems",
    description: `Counts events and distinct impacted users, grouped by *operating system*.
      Groups are sorted by event count, in descending order.
      Only counts events matching the given filters.`,
    inputSchema: ReportInputSchema,
    annotations: {
      title: "Get Crashlytics Top Operating Systems Report",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
    },
  },
  getReportContent(CrashlyticsReport.TopOperatingSystems),
);
