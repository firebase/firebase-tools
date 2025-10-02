import { z } from "zod";

import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { getApiFilter } from "../../../functions/functionslog";
import { listEntries } from "../../../gcp/cloudlogging";

const SEVERITY_LEVELS = [
  "DEFAULT",
  "DEBUG",
  "INFO",
  "NOTICE",
  "WARNING",
  "ERROR",
  "CRITICAL",
  "ALERT",
  "EMERGENCY",
] as const;

// normalizeFunctionSelectors standardizes tool input into the comma-separated
// list that the existing logging filter helper expects (matching CLI behaviour).
function normalizeFunctionSelectors(selectors?: string | string[]): string | undefined {
  if (!selectors) return undefined;
  if (Array.isArray(selectors)) {
    const cleaned = selectors.map((name) => name.trim()).filter(Boolean);
    return cleaned.length ? cleaned.join(",") : undefined;
  }
  const cleaned = selectors
    .split(/[,\s]+/)
    .map((name) => name.trim())
    .filter(Boolean);
  return cleaned.length ? cleaned.join(",") : undefined;
}

function validateTimestamp(label: string, value: string): string | null {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return `${label} must be an RFC3339/ISO 8601 timestamp, received '${value}'.`;
  }
  return null;
}

export const get_logs = tool(
  {
    name: "get_logs",
    description:
      "Retrieves a page of Cloud Functions log entries using Google Cloud Logging advanced filters.",
    inputSchema: z.object({
      function_names: z
        .union([z.string(), z.array(z.string()).min(1)])
        .optional()
        .describe(
          "Optional list of deployed Cloud Function names to filter logs (string or array).",
        ),
      page_size: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .default(50)
        .describe("Maximum number of log entries to return."),
      order: z.enum(["asc", "desc"]).default("desc").describe("Sort order by timestamp"),
      page_token: z
        .string()
        .optional()
        .describe("Opaque page token returned from a previous call to continue pagination."),
      min_severity: z
        .enum(SEVERITY_LEVELS)
        .optional()
        .describe("Filters results to entries at or above the provided severity level."),
      start_time: z
        .string()
        .optional()
        .describe(
          "RFC3339 timestamp (YYYY-MM-DDTHH:MM:SSZ). Only entries with timestamp greater than or equal to this are returned.",
        ),
      end_time: z
        .string()
        .optional()
        .describe(
          "RFC3339 timestamp (YYYY-MM-DDTHH:MM:SSZ). Only entries with timestamp less than or equal to this are returned.",
        ),
      filter: z
        .string()
        .optional()
        .describe(
          "Additional Google Cloud Logging advanced filter text that will be AND'ed with the generated filter.",
        ),
    }),
    annotations: {
      title: "Get Functions Logs from Cloud Logging",
      readOnlyHint: true,
      openWorldHint: true,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async (
    { function_names, page_size, order, page_token, min_severity, start_time, end_time, filter },
    { projectId },
  ) => {
    const resolvedOrder = order;
    const resolvedPageSize = page_size;

    const normalizedSelectors = normalizeFunctionSelectors(function_names);
    const filterParts: string[] = [getApiFilter(normalizedSelectors)];

    if (min_severity) {
      filterParts.push(`severity>="${min_severity}"`);
    }
    if (start_time) {
      const error = validateTimestamp("start_time", start_time);
      if (error) return mcpError(error);
      filterParts.push(`timestamp>="${start_time}"`);
    }
    if (end_time) {
      const error = validateTimestamp("end_time", end_time);
      if (error) return mcpError(error);
      filterParts.push(`timestamp<="${end_time}"`);
    }
    if (start_time && end_time && Date.parse(start_time) > Date.parse(end_time)) {
      return mcpError("start_time must be less than or equal to end_time.");
    }
    if (filter) {
      filterParts.push(`(${filter})`);
    }

    const combinedFilter = filterParts.join("\n");

    try {
      const { entries, nextPageToken } = await listEntries(
        projectId,
        combinedFilter,
        resolvedPageSize,
        resolvedOrder,
        page_token,
      );

      const formattedEntries = entries.map((entry) => {
        const functionName =
          entry.resource?.labels?.function_name ?? entry.resource?.labels?.service_name ?? null;
        const payload =
          entry.textPayload ?? entry.jsonPayload ?? entry.protoPayload ?? entry.labels ?? null;
        return {
          timestamp: entry.timestamp ?? entry.receiveTimestamp ?? null,
          severity: entry.severity ?? "DEFAULT",
          function: functionName,
          message:
            entry.textPayload ??
            (entry.jsonPayload ? JSON.stringify(entry.jsonPayload) : undefined) ??
            (entry.protoPayload ? JSON.stringify(entry.protoPayload) : undefined) ??
            "",
          payload,
          log_name: entry.logName,
          trace: entry.trace ?? null,
          span_id: entry.spanId ?? null,
        };
      });

      const response = {
        filter: combinedFilter,
        order: resolvedOrder,
        page_size: resolvedPageSize,
        entries: resolvedOrder === "asc" ? formattedEntries : formattedEntries.reverse(),
        next_page_token: nextPageToken ?? null,
        has_more: Boolean(nextPageToken),
      };

      if (!entries.length) {
        return toContent(response, {
          contentPrefix: "No log entries matched the provided filters.\n\n",
        });
      }

      return toContent(response);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to retrieve Cloud Logging entries.";
      return mcpError(message);
    }
  },
);
