import { dump, DumpOptions } from "js-yaml";
import { logger } from "../logger";
import { FirebaseError } from "../error";
import { CRASHLYTICS_API_CLIENT, parseProjectNumber, TIMEOUT } from "./utils";
import {
  BatchGetEventsResponse,
  Breadcrumb,
  Error,
  ErrorType,
  Event,
  Exception,
  Frame,
  ListEventsResponse,
  Log,
  Thread,
} from "./types";
import { EventFilter, filterToUrlSearchParams } from "./filters";

export const EVENT_DUMP_OPTIONS: DumpOptions = { lineWidth: 200 };
export const DEFAULT_MAX_FRAMES = 20;
const DEFAULT_MAX_LOGS = 100;
const DEFAULT_MAX_BREADCRUMBS = 10;

export interface EventFormatOptions {
  /** Maximum number of stack frames per thread/exception/error (default: 20). */
  maxFrames?: number;
  /** Disables truncation of threads, stack frames, logs, and breadcrumbs when true. */
  full?: boolean;
}

/**
 * List Crashlytics events matching the given filters.
 * @param appId Firebase app_id
 * @param filter An optional EventFilter to selectively filter the sample events.
 * @param pageSize optional, number of events to return
 * @param filterExpression optional AIP-160 filter expression for custom keys
 * @return A ListEventsResponse containing the most recent events matching the filters.
 */
export async function listEvents(
  appId: string,
  filter: EventFilter,
  pageSize = 1,
  filterExpression?: string,
): Promise<ListEventsResponse> {
  const requestProjectNumber = parseProjectNumber(appId);
  const queryParams = filterToUrlSearchParams(filter);
  queryParams.set("page_size", `${pageSize}`);
  if (filterExpression) {
    queryParams.set("filter_expression", filterExpression);
  }
  logger.debug(
    `[crashlytics] listEvents called with appId: ${appId}, filter: ${queryParams.toString()}, pageSize: ${pageSize}`,
  );
  const response = await CRASHLYTICS_API_CLIENT.request<void, ListEventsResponse>({
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    path: `/projects/${requestProjectNumber}/apps/${appId}/events`,
    queryParams: queryParams,
    timeout: TIMEOUT,
  });
  response.body.events ??= [];
  return response.body;
}

/**
 * Normalizes a short event ID or full event resource name into
 * `projects/{project}/apps/{app_id}/events/{event_id}`.
 */
export function normalizeEventResourceName(appId: string, eventIdOrName: string): string {
  const trimmed = eventIdOrName.trim();
  if (!trimmed) {
    throw new FirebaseError("Event ID cannot be empty.");
  }
  const requestProjectNumber = parseProjectNumber(appId);
  const expectedPrefix = `projects/${requestProjectNumber}/apps/${appId}/events/`;
  if (trimmed.startsWith(expectedPrefix)) {
    const eventId = trimmed.slice(expectedPrefix.length);
    if (eventId && !eventId.includes("/")) {
      return trimmed;
    }
  }
  if (trimmed.includes("/")) {
    throw new FirebaseError(
      `Invalid event resource name '${trimmed}'. Expected an event ID or '${expectedPrefix}{event_id}'.`,
    );
  }
  return `${expectedPrefix}${trimmed}`;
}

/**
 * Get multiple events by resource name.
 * Can be used with the `sampleEvent` resource included in topIssues reports.
 * @param appId Firebase app_id
 * @param eventNames the resource names for the desired events.
 * Format: "projects/{project}/apps/{app_id}/events/{event_id}"
 * @return A BatchGetEventsResponse including an array of Event.
 */
export async function batchGetEvents(
  appId: string,
  eventNames: string[],
): Promise<BatchGetEventsResponse> {
  const requestProjectNumber = parseProjectNumber(appId);
  if (eventNames.length > 100) throw new FirebaseError("Too many events in batchGet request");
  logger.debug(
    `[crashlytics] batchGetEvents called with appId: ${appId}, eventNames: ${eventNames.join(", ")}`,
  );
  const queryParams = new URLSearchParams();
  eventNames.forEach((en) => {
    queryParams.append("names", en);
  });
  const response = await CRASHLYTICS_API_CLIENT.request<void, BatchGetEventsResponse>({
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    path: `/projects/${requestProjectNumber}/apps/${appId}/events:batchGet`,
    queryParams: queryParams,
    timeout: TIMEOUT,
  });
  response.body.events ??= [];
  return response.body;
}

/**
 * Formats stack frames into readable lines, truncating when exceeding `maxFrames` unless `full` is set.
 */
export function formatFrames(
  origFrames: Frame[],
  maxFrames = DEFAULT_MAX_FRAMES,
  full = false,
): string[] {
  const frames: Frame[] = origFrames || [];
  const shouldTruncate = !full && frames.length > maxFrames;
  const sliceCount = maxFrames > 1 ? maxFrames - 1 : 1;
  const framesToFormat = shouldTruncate ? frames.slice(0, sliceCount) : frames;
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

/**
 * Formats an event into legible, token-efficient text content sections.
 */
export function toText(event: Event, options: EventFormatOptions = {}): Record<string, string> {
  if (!event) {
    return {};
  }
  const { maxFrames = DEFAULT_MAX_FRAMES, full = false } = options;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(event)) {
    if (key === "logs") {
      // [2025-01-01T00:00.000:00Z] Log message 1
      // [2025-01-01T00:00.000:00Z] Log message 2
      const logs: Array<Log> = (value as Array<Log>) || [];
      const slicedLogs =
        !full && logs.length > DEFAULT_MAX_LOGS ? logs.slice(logs.length - DEFAULT_MAX_LOGS) : logs;
      const logLines = slicedLogs.map((log) => `[${log.logTime}] ${log.message}`);
      result["logs"] = logLines.join("\n");
    } else if (key === "breadcrumbs") {
      // [2025-10-30T06:56:43.147Z] Event_Title1 { key1: value1, key2: value2 }
      // [2025-10-30T06:56:50.328Z] Event_Title2 { key1: value1, key2: value2 }
      const breadcrumbs = (value as Breadcrumb[]) || [];
      const slicedBreadcrumbs =
        !full && breadcrumbs.length > DEFAULT_MAX_BREADCRUMBS
          ? breadcrumbs.slice(-DEFAULT_MAX_BREADCRUMBS)
          : breadcrumbs;
      const breadcrumbLines = slicedBreadcrumbs.map((b) => {
        const paramString = Object.entries(b.params || {})
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ");
        const params = paramString ? ` { ${paramString} }` : "";
        return `[${b.eventTime}] ${b.title}${params}`;
      });
      result["breadcrumbs"] = breadcrumbLines.join("\n");
    } else if (key === "threads") {
      // Thread: Name (crashed)
      // at java.net.ClassName.methodName (Filename.java:123)
      // at ...
      let threads = (value as Thread[]) || [];
      if (
        !full &&
        (event.issue?.errorType === ErrorType.FATAL || event.issue?.errorType === ErrorType.ANR)
      ) {
        threads = threads.filter((t) => t.crashed || t.blamed);
      }
      const threadStrings = threads.map((thread) => {
        const header = `Thread: ${thread.name || thread.threadId || ""}${thread.crashed ? " (crashed)" : ""}`;
        const frameStrings = formatFrames(thread.frames || [], maxFrames, full);
        return [header, ...frameStrings].join("\n");
      });
      result["threads"] = threadStrings.join("\n\n");
    } else if (key === "exceptions") {
      // java.lang.IllegalArgumentException: something went wrong
      // at java.net.ClassName.methodName (Filename.java:123)
      // at ...
      const exceptions = (value as Exception[]) || [];
      const exceptionStrings = exceptions.map((exception) => {
        const header = exception.nested ? "Caused by: " : "";
        const exceptionHeader = `${header}${exception.type || ""}: ${exception.exceptionMessage || ""}`;
        const frameStrings = formatFrames(exception.frames || [], maxFrames, full);
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
        const frameStrings = formatFrames(error.frames || [], maxFrames, full);
        return [header, ...frameStrings].join("\n");
      });
      result["errors"] = errorStrings.join("\n\n");
    } else {
      // field:
      //   field: value
      result[key] = dump(value, EVENT_DUMP_OPTIONS);
    }
  }
  return result;
}
