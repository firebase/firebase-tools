import * as api from "../api";
import { FirebaseError } from "../error";
import { logger } from "../logger";

const API_VERSION = "v2";

export interface LogEntry {
  logName: string;
  resource: any;
  timestamp?: string;
  receiveTimestamp: string;
  severity?: any;
  insertId?: string;
  httpRequest?: any;
  labels?: any;
  metadata?: any;
  operation?: any;
  trace?: string;
  spanId?: string;
  traceSampled?: boolean;
  sourceLocation?: any;
  protoPayload?: any;
  textPayload?: string;
  jsonPayload?: any;
}

/**
 * GCP api call to list all log entries (https://cloud.google.com/logging/docs/reference/v2/rest/v2/entries/list)
 */
export async function listEntries(
  projectId: string,
  filter: string,
  pageSize: number,
  order: string
): Promise<LogEntry[]> {
  const endpoint = `/${API_VERSION}/entries:list`;
  try {
    const result = await api.request("POST", endpoint, {
      auth: true,
      data: {
        resourceNames: [`projects/${projectId}`],
        filter: filter,
        orderBy: "timestamp " + order,
        pageSize: pageSize,
      },
      origin: api.cloudloggingOrigin,
    });
    return result.body.entries;
  } catch (err) {
    throw new FirebaseError("Failed to retrieve log entries from Google Cloud.", {
      original: err,
    });
  }
}

/**
 * The correct API filter to use when GCFv2 is enabled and/or we want specific function logs
 * @param v2Enabled check if the user has the preview v2 enabled
 * @param functionList list of functions seperated by comma
 * @returns the correct filter for use when calling the list api
 */
export function getApiFilter(v2Enabled: boolean, functionList?: string) {
  const baseFilter = v2Enabled
    ? 'resource.type="cloud_function" OR (resource.type="cloud_run_revision" AND labels."goog-managed-by"="cloudfunctions")'
    : 'resource.type="cloud_function"';

  if (functionList) {
    const apiFuncFilters = functionList.split(",").map((fn) => {
      return v2Enabled
        ? `resource.labels.function_name="${fn}" ` + `OR resource.labels.service_name="${fn}"`
        : `resource.labels.function_name="${fn}"`;
    });
    return baseFilter + `\n(${apiFuncFilters.join(" OR ")})`;
  }

  return baseFilter;
}

/**
 * Logs all entires with info severity to the CLI
 * @param entries a list of {@link LogEntry}
 */
export function logEntries(entries: LogEntry[]): void {
  if (!entries || entries.length === 0) {
    logger.info("No log entries found.");
    return;
  }
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];

    logger.info(
      entry.timestamp || "---",
      (entry.severity || "?").substring(0, 1),
      (entry.resource.labels.function_name || entry.resource.labels.service_name) + ":",
      entry.textPayload ||
        JSON.stringify(entry.jsonPayload) ||
        JSON.stringify(entry.protoPayload) ||
        ""
    );
  }
}
