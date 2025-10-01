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

interface ListEntriesRequest {
  resourceNames: string[];
  filter: string;
  orderBy: string;
  pageSize: number;
  pageToken?: string;
}

interface ListEntriesResponse {
  entries?: LogEntry[];
  nextPageToken?: string;
}

/**
 * Lists Cloud Logging entries with optional pagination support.
 * Ref: https://cloud.google.com/logging/docs/reference/v2/rest/v2/entries/list
 */
export async function listEntries(
  projectId: string,
  filter: string,
  pageSize: number,
  order: string,
  pageToken?: string,
): Promise<{ entries: LogEntry[]; nextPageToken?: string }> {
  const client = new Client({ urlPrefix: cloudloggingOrigin(), apiVersion: API_VERSION });
  const body: ListEntriesRequest = {
    resourceNames: [`projects/${projectId}`],
    filter,
    orderBy: `timestamp ${order}`,
    pageSize,
  };
  if (pageToken) {
    body.pageToken = pageToken;
  }
  try {
    const result = await client.post<ListEntriesRequest, ListEntriesResponse>("/entries:list", body);
    return {
      entries: result.body.entries ?? [],
      nextPageToken: result.body.nextPageToken,
    };
  } catch (err: any) {
    throw new FirebaseError("Failed to retrieve log entries from Google Cloud.", {
      original: err,
    });
  }
}
