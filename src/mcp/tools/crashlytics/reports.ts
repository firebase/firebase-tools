import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { dump, DumpOptions } from "js-yaml";
import { EventFilter, validateEventFilters } from "../../../crashlytics/filters";
import { getReport, ReportInputSchema, simplifyReport } from "../../../crashlytics/reports";
import { Report } from "../../../crashlytics/types";
import { tool } from "../../tool";

import { RESOURCE_CONTENT as forceAppIdGuide } from "../../resources/guides/app_id";

const DUMP_OPTIONS: DumpOptions = { lineWidth: 200 };

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
      `Use this to request numerical reports from Crashlytics. The result aggregates the sum of events and impacted users, grouped by a dimension appropriate for that report. Agents must read the [Firebase Crashlytics Reports Guide](firebase://guides/crashlytics/reports) using the \`firebase_read_resources\` tool before calling to understand critical prerequisites for requesting reports and how to interpret the results.
    `.trim(),
    humanReadableDescription:
      "Generate aggregated numerical reports for Crashlytics issues and events.",
    inputSchema: ReportInputSchema,
    annotations: {
      title: "Get Crashlytics Report",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
    },
  },
  async ({ appId, report, pageSize, filter, granularity }) => {
    const result: CallToolResult = { content: [] };

    if (!appId) {
      result.isError = true;
      result.content.push({ type: "text", text: "Must specify 'appId' parameter" });
      result.content.push({ type: "text", text: forceAppIdGuide });
    }
    try {
      filter = validateEventFilters(filter || {});
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      result.isError = true;
      result.content.push({ type: "text", text: `Error: ${message}` });
    }
    if (result.content.length > 0) {
      // There are errors or guides the agent needs to read first.
      return result;
    }
    // Everything is OK so fetch report
    try {
      const reportResponse = simplifyReport(
        await getReport(report, appId, filter, pageSize, granularity),
      );
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${message}` }],
      };
    }
  },
);
