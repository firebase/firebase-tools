import * as api from "../api";
import { FirebaseError } from "../error";

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
