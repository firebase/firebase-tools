import { remoteConfigApiOrigin } from "../api";
import { Client } from "../apiv2";
import { logger } from "../logger";
import { FirebaseError, getError } from "../error";
import { ListRolloutOptions, ListRollouts, RemoteConfigRollout } from "./interfaces";
import * as Table from "cli-table3";

const TIMEOUT = 30000;

const apiClient = new Client({
  urlPrefix: remoteConfigApiOrigin(),
  apiVersion: "v1",
});

const TABLE_HEAD = [
  "Rollout ID",
  "Display Name",
  "Service",
  "Description",
  "State",
  "Start Time",
  "End Time",
  "Last Update Time",
  "ETag",
];

export const parseRolloutList = (rollouts: RemoteConfigRollout[]): string => {
  if (rollouts.length === 0) {
    return "\x1b[33mNo rollouts found.\x1b[0m";
  }

  const table = new Table({ head: TABLE_HEAD, style: { head: ["green"] } });

  for (const rollout of rollouts) {
    table.push([
      rollout.name.split("/").pop() || rollout.name,
      rollout.definition.displayName,
      rollout.definition.service,
      rollout.definition.description,
      rollout.state,
      rollout.startTime,
      rollout.endTime,
      rollout.lastUpdateTime,
      rollout.etag,
    ]);
  }
  return table.toString();
};

/**
 * Retrieves a list of rollouts for a given project and namespace.
 * @param projectId The project ID.
 * @param namespace The namespace of the rollout.
 * (Options are passed in listRolloutOptions object)
 * @return A promise that resolves to a list of Remote Config rollouts.
 */
export async function listRollouts(
  projectId: string,
  namespace: string,
  listRolloutOptions: ListRolloutOptions,
): Promise<ListRollouts> {
  try {
    const params = new URLSearchParams();
    if (listRolloutOptions.pageSize) {
      params.set("page_size", listRolloutOptions.pageSize);
    }
    if (listRolloutOptions.filter) {
      params.set("filter", listRolloutOptions.filter);
    }
    if (listRolloutOptions.pageToken) {
      params.set("page_token", listRolloutOptions.pageToken);
    }

    const res = await apiClient.request<void, ListRollouts>({
      method: "GET",
      path: `/projects/${projectId}/namespaces/${namespace}/rollouts`,
      queryParams: params,
      timeout: TIMEOUT,
    });
    return res.body;
  } catch (err: unknown) {
    const error: Error = getError(err);
    logger.debug(error.message);
    throw new FirebaseError(
      `Failed to get Remote Config rollouts for project ${projectId}. Error: ${error.message}`,
      { original: error },
    );
  }
}
