import { z } from "zod";
import { tool } from "../../tool";
import { dump, DumpOptions } from "js-yaml";
import { batchGetEvents, listEvents } from "../../../crashlytics/events";
import {
  BatchGetEventsResponse,
  Breadcrumb,
  ErrorType,
  Event,
  Exception,
  Frame,
  ListEventsResponse,
  Log,
  Thread,
  Error,
} from "../../../crashlytics/types";
import { ApplicationIdSchema, EventFilterSchema } from "../../../crashlytics/filters";
import { mcpError } from "../../util";

const DUMP_OPTIONS: DumpOptions = { lineWidth: 200 };

function formatFrames(origFrames: Frame[], maxFrames = 20): string[] {
  const frames: Frame[] = origFrames || [];
  const shouldTruncate = frames.length > maxFrames;
  const framesToFormat = shouldTruncate ? frames.slice(0, maxFrames - 1) : frames;
  const formatted = framesToFormat.map((frame) => {
    let line = `at`;
    if (frame.symbol) {
      line += ` ${frame.symbol}`;
    }
    if (frame.file) {
      line += ` (${frame.file}`;
      if (frame.line) {
        line += `:${frame.line}`;
      }
      line += ")";
    }
    return line;
  });
  if (shouldTruncate) {
    formatted.push("... frames omitted ...");
  }
  return formatted;
}

// Formats an event into more legible, token-efficient text content sections

function toText(event: Event): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(event)) {
    if (key === "logs") {
      // [2025-01-01T00:00.000:00Z] Log message 1
      // [2025-01-01T00:00.000:00Z] Log message 2
      const logs: Array<Log> = (value as Array<Log>) || [];
      const slicedLogs = logs.length > 100 ? logs.slice(logs.length - 100) : logs;
      const logLines = slicedLogs.map((log) => `[${log.logTime}] ${log.message}`);
      result["logs"] = logLines.join("\n");
    } else if (key === "breadcrumbs") {
      // [2025-10-30T06:56:43.147Z] Event_Title1 { key1: value1, key2: value2 }                                                                               │
      // [2025-10-30T06:56:50.328Z] Event_Title2 { key1: value1, key2: value2 }
      const breadcrumbs = (value as Breadcrumb[]) || [];
      const slicedBreadcrumbs = breadcrumbs.length > 10 ? breadcrumbs.slice(-10) : breadcrumbs;
      const breadcrumbLines = slicedBreadcrumbs.map((b) => {
        const paramString = Object.entries(b.params)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ");
        const params = paramString ? ` { ${paramString} }` : "";
        return `[${b.eventTime}] ${b.title}${params}`;
      });
      result["breadcrumbs"] = breadcrumbLines.join("\n");
    } else if (key === "threads") {
      // Thread: Name (crashed)                                                                                                                                                                     │
      // at java.net.ClassName.methodName (Filename.java:123)
      // at ...
      let threads = (value as Thread[]) || [];
      if (event.issue?.errorType === ErrorType.FATAL || event.issue?.errorType === ErrorType.ANR) {
        threads = threads.filter((t) => t.crashed || t.blamed);
      }
      const threadStrings = threads.map((thread) => {
        const header = `Thread: ${thread.name || thread.threadId || ""}${thread.crashed ? " (crashed)" : ""}`;
        const frameStrings = formatFrames(thread.frames || []);
        return [header, ...frameStrings].join("\n");
      });
      result["threads"] = threadStrings.join("\n\n");
    } else if (key === "exceptions") {
      // java.lang.IllegalArgumentException: something went wrong                                                                                                                                              │
      // at java.net.ClassName.methodName (Filename.java:123)
      // at ...
      const exceptions = (value as Exception[]) || [];
      const exceptionStrings = exceptions.map((exception) => {
        const header = exception.nested ? "Caused by: " : "";
        const exceptionHeader = `${header}${exception.type || ""}: ${exception.exceptionMessage || ""}`;
        const frameStrings = formatFrames(exception.frames || []);
        return [exceptionHeader, ...frameStrings].join("\n");
      });
      result["exceptions"] = exceptionStrings.join("\n\n");
    } else if (key === "errors") {
      // Error: error title
      // at ClassName.method (Filename.cc:123)
      // at ...
      const errors = (value as Error[]) || [];
      const errorStrings = errors.map((error) => {
        const header = `Error: ${error.title || "error"}`;
        const frameStrings = formatFrames(error.frames || []);
        return [header, ...frameStrings].join("\n");
      });
      result["errors"] = errorStrings.join("\n\n");
    } else {
      // field:
      //   field: value
      result[key] = dump(value, DUMP_OPTIONS);
    }
  }
  return result;
}

export const list_events = tool(
  "crashlytics",
  {
    name: "list_events",
    description: `Use this to list the most recent events matching the given filters.
      Can be used to fetch sample crashes and exceptions for an issue,
      which will include stack traces and other data useful for debugging.`,
    inputSchema: z.object({
      appId: ApplicationIdSchema,
      filter: EventFilterSchema,
      pageSize: z.number().describe("Number of rows to return").default(1),
    }),
    annotations: {
      title: "List Crashlytics Events",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
    },
  },
  async ({ appId, filter, pageSize }) => {
    if (!appId) return mcpError(`Must specify 'appId' parameter.`);
    if (!filter || (!filter.issueId && !filter.issueVariantId))
      return mcpError(`Must specify 'filter.issueId' or 'filter.issueVariantId' parameters.`);

    const response: ListEventsResponse = await listEvents(appId, filter, pageSize);
    const eventsContent = response.events?.map((e) => toText(e)) || [];
    return {
      content: [{ type: "text", text: dump(eventsContent, DUMP_OPTIONS) }],
    };
  },
);

export const batch_get_events = tool(
  "crashlytics",
  {
    name: "batch_get_events",
    description: `Gets specific events by resource name.
      Can be used to fetch sample crashes and exceptions for an issue,
      which will include stack traces and other data useful for debugging.`,
    inputSchema: z.object({
      appId: ApplicationIdSchema,
      names: z
        .array(z.string())
        .describe(
          "An array of the event resource names, as found in the sampleEvent field in reports.",
        ),
    }),
    annotations: {
      title: "Batch Get Crashlytics Events",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
    },
  },
  async ({ appId, names }) => {
    if (!appId) return mcpError(`Must specify 'appId' parameter.`);
    if (!names || names.length === 0)
      return mcpError(`Must provide event resource names in name parameter.`);

    const response: BatchGetEventsResponse = await batchGetEvents(appId, names);
    const eventsContent = response.events?.map((e) => toText(e)) || [];
    return {
      content: [{ type: "text", text: dump(eventsContent, DUMP_OPTIONS) }],
    };
  },
);
