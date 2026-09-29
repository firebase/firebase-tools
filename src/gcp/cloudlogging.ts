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
    const result = await client.post<ListEntriesRequest, ListEntriesResponse>(
      "/entries:list",
      body,
    );
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

export interface LogBucket {
  name: string;
  description?: string;
  createTime?: string;
  updateTime?: string;
  retentionDays?: number;
  locked?: boolean;
  lifecycleState?: string;
  analyticsEnabled?: boolean;
}

export interface LogSink {
  name: string;
  destination: string;
  filter?: string;
  description?: string;
  disabled?: boolean;
  writerIdentity?: string;
}

/**
 * Creates or updates a Cloud Logging Log Bucket.
 * Ref: https://cloud.google.com/logging/docs/reference/v2/rest/v2/projects.locations.buckets
 */
export async function createOrUpdateLogBucket(
  projectId: string,
  bucketId: string,
  location = "global",
  analyticsEnabled = true,
): Promise<LogBucket> {
  const client = new Client({ urlPrefix: cloudloggingOrigin(), apiVersion: API_VERSION });
  const path = `/projects/${projectId}/locations/${location}/buckets`;
  try {
    const res = await client.post<{ analyticsEnabled: boolean }, LogBucket>(
      `${path}?bucketId=${bucketId}`,
      { analyticsEnabled },
    );
    return res.body;
  } catch (err: any) {
    if (err.status === 409) {
      try {
        const patchRes = await client.patch<{ analyticsEnabled: boolean }, LogBucket>(
          `${path}/${bucketId}?updateMask=analyticsEnabled`,
          { analyticsEnabled },
        );
        return patchRes.body;
      } catch (patchErr: any) {
        const msg = patchErr.message || JSON.stringify(patchErr.body) || patchErr;
        throw new FirebaseError(
          `Failed to patch log bucket ${bucketId} (status ${patchErr.status}): ${msg}`,
          { original: patchErr },
        );
      }
    }
    const msg = err.message || JSON.stringify(err.body) || err;
    if (typeof msg === "string" && msg.toLowerCase().includes("billing account")) {
      throw new FirebaseError(
        `Creating a Cloud Logging bucket requires a valid linked billing account (Blaze plan). Please attach a billing account to project ${projectId} and try again.`,
        { original: err },
      );
    }
    throw new FirebaseError(
      `Failed to create or update log bucket ${bucketId} (status ${err.status}): ${msg}`,
      { original: err },
    );
  }
}

/**
 * Creates or updates a Cloud Logging Log Sink.
 * Ref: https://cloud.google.com/logging/docs/reference/v2/rest/v2/projects.sinks
 */
export async function createOrUpdateLogSink(
  projectId: string,
  sinkName: string,
  destination: string,
  filter: string,
): Promise<LogSink> {
  const client = new Client({ urlPrefix: cloudloggingOrigin(), apiVersion: API_VERSION });
  const path = `/projects/${projectId}/sinks`;
  const body = {
    name: sinkName,
    destination,
    filter,
  };
  try {
    const res = await client.post<typeof body, LogSink>(path, body);
    return res.body;
  } catch (err: any) {
    if (err.status === 409) {
      try {
        const putRes = await client.put<typeof body, LogSink>(`${path}/${sinkName}`, body);
        return putRes.body;
      } catch (putErr: any) {
        const msg = putErr.message || JSON.stringify(putErr.body) || putErr;
        throw new FirebaseError(
          `Failed to update log sink ${sinkName} (status ${putErr.status}): ${msg}`,
          { original: putErr },
        );
      }
    }
    const msg = err.message || JSON.stringify(err.body) || err;
    throw new FirebaseError(
      `Failed to create or update log sink ${sinkName} (status ${err.status}): ${msg}`,
      { original: err },
    );
  }
}
