import { cloudTraceOrigin } from "../api";
import { Client } from "../apiv2";
import { FirebaseError, getErrMsg, getError } from "../error";

const API_VERSION = "v2";

const getTraceClient = (): Client =>
  new Client({
    urlPrefix: cloudTraceOrigin(),
    auth: true,
    apiVersion: API_VERSION,
  });

interface Span {
  name: string;
  spanId: string;
  displayName: { value: string };
  startTime: string;
  endTime: string;
}

interface BatchWriteSpansRequest {
  name: string;
  spans: Span[];
}

/**
 * Sends a mock span to Cloud Trace to trigger BigQuery _Trace dataset provisioning.
 * Ref: https://cloud.google.com/trace/docs/reference/v2/rest/v2/projects.traces/batchWrite
 */
export async function provisionTraceStorage(projectId: string): Promise<void> {
  // Use the same arbitrary IDs that the GCP backend uses
  const TRACE_ID = "33fc0d8c45bb4e5cebb29f047931270d";
  const SPAN_ID = "f8fde40b437488e5";

  const now = new Date();
  const later = new Date(now.getTime() + 1000);

  const payload: BatchWriteSpansRequest = {
    name: `projects/${projectId}`,
    spans: [
      {
        name: `projects/${projectId}/traces/${TRACE_ID}/spans/${SPAN_ID}`,
        spanId: SPAN_ID,
        displayName: { value: "/welcome" },
        startTime: now.toISOString(),
        endTime: later.toISOString(),
      },
    ],
  };

  try {
    // Send the mock span to trigger BigQuery _Trace database creation
    await getTraceClient().post<BatchWriteSpansRequest, void>(
      `/projects/${projectId}/traces:batchWrite`,
      payload,
    );
  } catch (err: unknown) {
    throw new FirebaseError(
      `Failed to provision trace storage for project ${projectId}: ${getErrMsg(err)}`,
      {
        original: getError(err),
      },
    );
  }
}
