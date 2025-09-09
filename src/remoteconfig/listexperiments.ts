import { remoteConfigApiOrigin } from "../api";
import { Client } from "../apiv2";
import { logger } from "../logger";
import * as Table from "cli-table3";
import { FirebaseError, getErrMsg } from "../error";
import { ListExperimentsResult, RemoteConfigExperiment } from "./interfaces";

const TIMEOUT = 30000;

const apiClient = new Client({
  urlPrefix: remoteConfigApiOrigin(),
  apiVersion: "v1",
});

export const parseExperimentIntoTable = (experiments: RemoteConfigExperiment[]): string => {
  const tableHead = [
    "Number",
    "Display Name",
    "Service",
    "State",
    "Start Time",
    "End Time",
    "Last Update Time",
    "etag",
  ];
  const table = new Table({ head: tableHead, style: { head: ["green"] } });
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
    if (err instanceof Error) {
      logger.debug(err.message);
    }
    throw new FirebaseError(
      `Failed to get Remote Config experiments for project ${projectId}. Error: ${getErrMsg(err)}`,
      { original: err as Error },
    );
  }
}
