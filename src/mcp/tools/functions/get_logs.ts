import { z } from "zod";

import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { getApiFilter } from "../../../functions/functionslog";
import { listEntries } from "../../../gcp/cloudlogging";
import { formatLogEntries } from "./formatter";
import { formatLoggingError } from "./errors";

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
        .describe("Optional list of deployed Cloud Function names to filter logs (string or array)."),
      page_size: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .default(50)
        .describe("Maximum number of log entries to return."),
      order: z
        .enum(["asc", "desc"])
        .default("desc")
        .describe("Sort order by timestamp (desc matches the Firebase CLI default)."),
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
        .describe("RFC3339 timestamp. Only entries with timestamp greater than or equal to this are returned."),
      end_time: z
        .string()
        .optional()
        .describe("RFC3339 timestamp. Only entries with timestamp less than or equal to this are returned."),
      filter: z
        .string()
        .optional()
        .describe(
          "Additional Google Cloud Logging advanced filter text that will be AND'ed with the generated filter.",
        ),
    }),
    annotations: {
      title: "Get Cloud Functions Logs",
      readOnlyHint: true,
      openWorldHint: true,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async (
    {
      function_names,
      page_size,
      order,
      page_token,
      min_severity,
      start_time,
      end_time,
      filter,
    },
    { projectId },
  ) => {
    const normalizedOrder = typeof order === "string" ? order.toLowerCase() : undefined;
    let resolvedOrder: "asc" | "desc" = "desc";
    if (normalizedOrder) {
      if (normalizedOrder !== "asc" && normalizedOrder !== "desc") {
        return mcpError('`order` must be either "asc" or "desc".');
      }
      resolvedOrder = normalizedOrder;
    }
    const resolvedPageSize = page_size ?? 50;
    if (resolvedPageSize < 1 || resolvedPageSize > 1000) {
      return mcpError("`page_size` must be between 1 and 1000.");
    }

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

    let entries: Awaited<ReturnType<typeof listEntries>>["entries"];
    let nextPageToken: string | undefined;
    try {
      const result = await listEntries(
        projectId,
        combinedFilter,
        resolvedPageSize,
        resolvedOrder,
        page_token,
      );
      entries = result.entries;
      nextPageToken = result.nextPageToken;
    } catch (err) {
      return mcpError(formatLoggingError(err));
    }

    const formatted = formatLogEntries(entries, {
      filter: combinedFilter,
      order: resolvedOrder,
      page_size: resolvedPageSize,
      nextPageToken,
    });

    if (!entries.length) {
      return toContent(formatted, {
        contentPrefix: "No log entries matched the provided filters.\n\n",
      });
    }

    return toContent(formatted);
  },
);
