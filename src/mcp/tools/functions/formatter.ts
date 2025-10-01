import { LogEntry } from "../../../gcp/cloudlogging";

export interface FormattedLogEntries {
  context: {
    filter: string;
    order: string;
    page_size: number;
    next_page_token: string | null;
    has_more: boolean;
  };
  summary: {
    total: number;
    window?: { earliest: string; latest: string } | null;
    severity_counts: Record<string, number>;
    function_counts: Record<string, number>;
  };
  entries: Array<{
    timestamp: string | null;
    severity: string;
    function: string | null;
    message: string;
    truncated_message?: boolean;
    stack?: string[];
    log_name: string;
    resource_type: string | null;
    trace: string | null;
    span_id: string | null;
    fields?: Record<string, unknown>;
  }>;
}

const MESSAGE_MAX_LENGTH = 400;

function summarizeEntries(entries: LogEntry[]) {
  if (!entries.length) {
    return {
      total: 0,
      window: null,
      severity_counts: {},
      function_counts: {},
    };
  }

  const severity_counts: Record<string, number> = {};
  const function_counts: Record<string, number> = {};
  let earliest: string | undefined;
  let latest: string | undefined;

  for (const entry of entries) {
    const severity = entry.severity || "DEFAULT";
    severity_counts[severity] = (severity_counts[severity] || 0) + 1;

    const fnName =
      entry.resource?.labels?.function_name ??
      entry.resource?.labels?.service_name ??
      "<unknown>";
    function_counts[fnName] = (function_counts[fnName] || 0) + 1;

    const ts = entry.timestamp || entry.receiveTimestamp;
    if (ts) {
      if (!earliest || ts < earliest) earliest = ts;
      if (!latest || ts > latest) latest = ts;
    }
  }

  return {
    total: entries.length,
    window: earliest && latest ? { earliest, latest } : null,
    severity_counts,
    function_counts,
  };
}

function extractMessage(entry: LogEntry): {
  message: string;
  truncated?: boolean;
} {
  const payloadText = entry.textPayload ||
    (entry.jsonPayload ? JSON.stringify(entry.jsonPayload) : null) ||
    (entry.protoPayload ? JSON.stringify(entry.protoPayload) : null) ||
    (entry.labels ? JSON.stringify(entry.labels) : null);

  if (!payloadText) {
    return { message: "" };
  }

  if (payloadText.length <= MESSAGE_MAX_LENGTH) {
    return { message: payloadText };
  }

  return {
    message: payloadText.slice(0, MESSAGE_MAX_LENGTH),
    truncated: true,
  };
}

function extractStack(entry: LogEntry): string[] | undefined {
  const text = entry.textPayload ?? "";
  if (!text.includes("\n")) return undefined;
  const frames = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("at "));
  return frames.length ? frames.slice(0, 10) : undefined;
}

function extractFields(entry: LogEntry): Record<string, unknown> | undefined {
  const fields = entry.jsonPayload || entry.labels;
  if (!fields) return undefined;
  if (typeof fields !== "object") return undefined;
  return fields;
}

export function formatLogEntries(
  entries: LogEntry[],
  options: {
    filter: string;
    order: string;
    page_size: number;
    nextPageToken?: string;
  },
): FormattedLogEntries {
  const summary = summarizeEntries(entries);

  const formattedEntries = entries.map((entry) => {
    const messageInfo = extractMessage(entry);
    const stack = extractStack(entry);
    const functionName =
      entry.resource?.labels?.function_name ??
      entry.resource?.labels?.service_name ??
      null;
    const formattedEntry: {
      timestamp: string | null;
      severity: string;
      function: string | null;
      message: string;
      truncated_message?: boolean;
      stack?: string[];
      log_name: string;
      resource_type: string | null;
      trace: string | null;
      span_id: string | null;
      fields?: Record<string, unknown>;
    } = {
      timestamp: entry.timestamp ?? entry.receiveTimestamp ?? null,
      severity: entry.severity ?? "DEFAULT",
      function: functionName,
      message: messageInfo.message,
      log_name: entry.logName,
      resource_type: entry.resource?.type ?? null,
      trace: entry.trace ?? null,
      span_id: entry.spanId ?? null,
    };
    if (messageInfo.truncated) formattedEntry.truncated_message = true;
    if (stack) formattedEntry.stack = stack;
    const fields = extractFields(entry);
    if (fields) formattedEntry.fields = fields;
    return formattedEntry;
  });

  if (options.order === "desc") {
    formattedEntries.reverse();
  }

  return {
    context: {
      filter: options.filter,
      order: options.order,
      page_size: options.page_size,
      next_page_token: options.nextPageToken ?? null,
      has_more: Boolean(options.nextPageToken),
    },
    summary,
    entries: formattedEntries,
  };
}
