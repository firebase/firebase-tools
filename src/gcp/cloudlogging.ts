import { cloudloggingOrigin } from "../api";
import { Client } from "../apiv2";
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
  order: string,
): Promise<LogEntry[]> {
  const client = new Client({ urlPrefix: cloudloggingOrigin, apiVersion: API_VERSION });
  try {
    const result = await client.post<
      { resourceNames: string[]; filter: string; orderBy: string; pageSize: number },
      { entries: LogEntry[] }
    >("/entries:list", {
      resourceNames: [`projects/${projectId}`],
      filter: filter,
      orderBy: `timestamp ${order}`,
      pageSize: pageSize,
    });
    return result.body.entries;
  } catch (err: any) {
    throw new FirebaseError("Failed to retrieve log entries from Google Cloud.", {
      original: err,
    });
  }
}
