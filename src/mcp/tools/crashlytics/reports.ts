import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import {
  CrashlyticsReport,
  getReport,
  ReportInputSchema,
  ReportInput,
  simplifyReport,
} from "../../../crashlytics/reports";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { validateEventFilters } from "../../../crashlytics/filters";

// Generates the tool call fn for requesting a Crashlytics report

function getReportContent(
  report: CrashlyticsReport,
  additionalPrompt?: string,
): (input: ReportInput) => Promise<CallToolResult> {
  return async ({ appId, filter, pageSize }) => {
    if (!appId) return mcpError(`Must specify 'appId' parameter.`);
    filter ??= {};
    if (!!filter.intervalStartTime && !filter.intervalEndTime) {
      // interval.end_time is required if interval.start_time is set but the agent likes to forget it
      filter.intervalEndTime = new Date().toISOString();
    }
    if (report === CrashlyticsReport.TopIssues && !!filter.issueId) {
      delete filter.issueId;
    }
    validateEventFilters(filter); // throws here if invalid filters
    const reportResponse = simplifyReport(await getReport(report, appId, filter, pageSize));
    if (!reportResponse.groups?.length) {
      additionalPrompt = "This report response contains no results.";
    }
    if (additionalPrompt) {
      reportResponse.usage = (reportResponse.usage || "").concat("\n", additionalPrompt);
    }
    return toContent(reportResponse);
  };
}

// Currently, it appears to work best if the five different supported reports
// are expressed as five different tools. This allows the usage and format
// of each report to be more clearly described. In the future, it may be possible
// to consolidate all of these into a single `get_report` tool.

export const get_top_issues = tool(
  "crashlytics",
  {
    name: "get_top_issues",
    description: `Use this to count events and distinct impacted users, grouped by *issue*.
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
  getReportContent(
    CrashlyticsReport.TopIssues,
    `The crashlytics_batch_get_event tool can retrieve the sample events in this response.
    Pass the sampleEvent in the names field.
    The crashlytics_list_events tool can retrieve a list of events for an issue in this response.
    Pass the issue.id in the filter.issueId field.`,
  ),
);

export const get_top_variants = tool(
  "crashlytics",
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
  getReportContent(
    CrashlyticsReport.TopVariants,
    `The crashlytics_get_top_issues tool can report the top issues for the variants in this response.
    Pass the variant.displayName in the filter.variantDisplayNames field. 
    The crashlytics_list_events tool can retrieve a list of events for a variant in this response.`,
  ),
);

export const get_top_versions = tool(
  "crashlytics",
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
  getReportContent(
    CrashlyticsReport.TopVersions,
    `The crashlytics_get_top_issues tool can report the top issues for the versions in this response.
    Pass the version.displayName in the filter.versionDisplayNames field. 
    The crashlytics_list_events tool can retrieve a list of events for a version in this response.`,
  ),
);

export const get_top_apple_devices = tool(
  "crashlytics",
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
  getReportContent(
    CrashlyticsReport.TopAppleDevices,
    `The crashlytics_get_top_issues tool can report the top issues for the devices in this response.
    Pass the device.displayName in the filter.deviceDisplayNames field. 
    The crashlytics_list_events tool can retrieve a list of events for a device in this response.`,
  ),
);

export const get_top_android_devices = tool(
  "crashlytics",
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
  getReportContent(
    CrashlyticsReport.TopAndroidDevices,
    `The crashlytics_get_top_issues tool can report the top issues for the devices in this response.
    Pass the device.displayName in the filter.deviceDisplayNames field. 
    The crashlytics_list_events tool can retrieve a list of events for a device in this response.`,
  ),
);

export const get_top_operating_systems = tool(
  "crashlytics",
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
  getReportContent(
    CrashlyticsReport.TopOperatingSystems,
    `The crashlytics_get_top_issues tool can report the top issues for the operating systems in this response.
    Pass the operatingSystem.displayName in the filter.operatingSystemDisplayNames field. 
    The crashlytics_list_events tool can retrieve a list of events for an operating system in this response.`,
  ),
);
