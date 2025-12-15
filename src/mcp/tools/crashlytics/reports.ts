import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { dump, DumpOptions } from "js-yaml";
import { EventFilter, validateEventFilters } from "../../../crashlytics/filters";
import { getReport, ReportInputSchema, simplifyReport } from "../../../crashlytics/reports";
import { Report } from "../../../crashlytics/types";
import { tool } from "../../tool";

import { RESOURCE_CONTENT as forceAppIdGuide } from "../../resources/guides/app_id";

const DUMP_OPTIONS: DumpOptions = { lineWidth: 200 };

const REPORT_ERROR_CONTENT = `
Must specify the desired report:
  * TOP_ISSUES - metrics grouped by *issue*.
  * TOP_VARIANTS - metrics grouped by issue *variant*
  * TOP_VERSIONS - metrics grouped by *version*
  * TOP_OPERATING_SYSTEMS - metrics grouped by *operating system*
  * TOP_ANDROID_DEVICES - metrics grouped by *device*
  * TOP_APPLE_DEVICES - metrics grouped by *device*
`.trim();

function toText(response: Report, filters: EventFilter): Record<string, string> {
  const result: Record<string, string> = {
    name: response.name || "", // So name is first in the output
    filters: dump(filters, DUMP_OPTIONS),
  };
  for (const [key, value] of Object.entries(response)) {
    if (key === "name") {
      continue;
    }
    result[key] = dump(value, DUMP_OPTIONS);
  }
  return result;
}

// Generates the tool call fn for requesting a Crashlytics report

export const get_report = tool(
  "crashlytics",
  {
    name: "get_report",
    description:
      `**REQUIRED PREREQUISITE:** READ firebase://guides/app_id, firebase://guides/crashlytics/reports, and firebase://guides/crashlytics/issues.
      **DO NOT FETCH DATA FIRST. IT WILL CAUSE ERRORS AND WASTE TOKENS AND TIME. READING THE GUIDES IS THE MOST EFFICIENT WAY TO GET THE ANSWERS YOU WANT.**
      AGENTS MUST READ these guides to fetch, format, and interpret report results or TOOL CALLS WILL FAIL.

      Use this to request numerical reports from Crashlytics.
    `.trim(),
    inputSchema: ReportInputSchema,
    annotations: {
      title: "Get Crashlytics Report",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
    },
  },
  async ({ appId, report, pageSize, filter }) => {
    const result: CallToolResult = { content: [] };

    if (!report) {
      result.isError = true;
      result.content.push({ type: "text", text: `Error: ${REPORT_ERROR_CONTENT}` });
    }
    if (!appId) {
      result.isError = true;
      result.content.push({ type: "text", text: "Must specify 'appId' parameter" });
      result.content.push({ type: "text", text: forceAppIdGuide });
    }
    try {
      filter = validateEventFilters(filter || {});
    } catch (error: any) {
      result.isError = true;
      result.content.push({ type: "text", text: `Error: ${error.message}` });
    }
    if (result.content.length > 0) {
      // There are errors or guides the agent needs to read first.
      return result;
    }
    // Everything is OK so fetch report
    const reportResponse = simplifyReport(await getReport(report, appId, filter, pageSize));
    reportResponse.usage =
      reportResponse.groups && reportResponse.groups.length
        ? reportResponse.usage || ""
        : "This report response contains no results."; // Helps to make empty state more obvious

    return {
      content: [
        {
          type: "text",
          text: dump(toText(reportResponse, filter), DUMP_OPTIONS),
        },
      ],
    };
  },
);
