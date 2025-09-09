import { remoteConfigApiOrigin } from "../api";
import { Client } from "../apiv2";
import { logger } from "../logger";
import * as Table from "cli-table3";
import { FirebaseError, getErrMsg, getError } from "../error";
import { ListExperimentsResult, RemoteConfigExperiment } from "./interfaces";

const TIMEOUT = 30000;
const TABLE_HEAD = [
  "Number",
  "Display Name",
  "Service",
  "State",
  "Start Time",
  "End Time",
  "Last Update Time",
  "etag",
];

const apiClient = new Client({
  urlPrefix: remoteConfigApiOrigin(),
  apiVersion: "v1",
});

export const parseExperimentList = (experiments: RemoteConfigExperiment[]): string => {
  if (!experiments) return "\x1b[31mNo experiments found\x1b[0m";
  
  const table = new Table({ head: TABLE_HEAD, style: { head: ["green"] } });
  for (const experiment of experiments) {
    const experimentNumber = experiment.name.split("/").pop();
    table.push([
      experimentNumber,
      experiment.definition.displayName,
      experiment.definition.service,
      experiment.state,
      experiment.startTime,
      experiment.endTime,
      experiment.lastUpdateTime,
      experiment.etag,
    ]);
  }
  return table.toString();
};

export async function listExperiments(
  projectId: string,
  namespace: string,
  pageToken?: string,
  pageSize?: string,
  filter?: string,
): Promise<ListExperimentsResult> {
  try {
    const params = new URLSearchParams();
    if (pageSize) {
      params.set("page_size", pageSize);
    }
    if (filter) {
      params.set("filter", filter);
    }
    if (pageToken) {
      params.set("page_token", pageToken);
    }
    const res = await apiClient.request<void, ListExperimentsResult>({
      method: "GET",
      path: `projects/${projectId}/namespaces/${namespace}/experiments`,
      queryParams: params,
      timeout: TIMEOUT,
    });
    return res.body;
  } catch (err: unknown) {
    const error: Error = getError(err);
    logger.debug(error.message);
    throw new FirebaseError(
      `Failed to get Remote Config experiments for project ${projectId}. Error: ${error.message}`,
      { original: error },
    );
  }
}
