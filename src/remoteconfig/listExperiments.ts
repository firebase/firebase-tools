import Table from "cli-table3";

import { remoteConfigApiOrigin } from "../api";
import { Client } from "../apiv2";
import { logger } from "../logger";
import { FirebaseError, getError } from "../error";
import { ListExperimentOptions, ListExperimentsResult, RemoteConfigExperiment } from "./interfaces";

const TIMEOUT = 30000;
const TABLE_HEAD = [
  "Experiment ID",
  "Display Name",
  "Service",
  "Description",
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

/**
 * Parses a list of Remote Config experiments and formats it into a table.
 * @param experiments A list of Remote Config experiments.
 * @return A tabular representation of the experiments.
 */
export const parseExperimentList = (experiments: RemoteConfigExperiment[]): string => {
  if (experiments.length === 0) return "\x1b[33mNo experiments found\x1b[0m";

  const table = new Table({ head: TABLE_HEAD, style: { head: ["green"] } });
  for (const experiment of experiments) {
    table.push([
      experiment.name.split("/").pop(), // Extract the experiment number
      experiment.definition.displayName,
      experiment.definition.service,
      experiment.definition.description,
      experiment.state,
      experiment.startTime,
      experiment.endTime,
      experiment.lastUpdateTime,
      experiment.etag,
    ]);
  }
  return table.toString();
};

/**
 * Returns a list of Remote Config experiments.
 * @param projectId The ID of the project.
 * @param namespace The namespace under which the experiment is created.
 * @param listExperimentOptions Options for listing experiments (e.g., page size, filter, page token).
 * @return A promise that resolves to a list of experiment.
 */
export async function listExperiments(
  projectId: string,
  namespace: string,
  listExperimentOptions: ListExperimentOptions,
): Promise<ListExperimentsResult> {
  try {
    const params = new URLSearchParams();
    if (listExperimentOptions.pageSize) {
      params.set("page_size", listExperimentOptions.pageSize);
    }
    if (listExperimentOptions.filter) {
      params.set("filter", listExperimentOptions.filter);
    }
    if (listExperimentOptions.pageToken) {
      params.set("page_token", listExperimentOptions.pageToken);
    }
    logger.debug(`Query parameters for listExperiments: ${params.toString()}`);
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
