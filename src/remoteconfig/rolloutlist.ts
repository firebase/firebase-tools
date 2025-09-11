import { remoteConfigApiOrigin } from "../api";
import { Client } from "../apiv2";
import { logger } from "../logger";
import { FirebaseError, getError } from "../error";
import { ListRollouts, RemoteConfigRollout } from "./interfaces"; // Import from the single source of truth.
import * as Table from "cli-table3";
import * as util from "util";

const TIMEOUT = 30000;

const apiClient = new Client({
  urlPrefix: remoteConfigApiOrigin(),
  apiVersion: "v1",
});

const TABLE_HEAD = [
  "Name",
  "Display Name",
  "Description",
  "State",
  "Create Time",
  "Start Time",
  "End Time",
  "Last Update Time",
  "Control Variant",
  "Enabled Variant",
  "ETag",
];

export const parseRolloutList = (rollouts: RemoteConfigRollout[]): string => {
  if (!rollouts || rollouts.length === 0) {
    return "\x1b[31mNo rollouts found.\x1b[0m";
  }

  const table = new Table({ head: TABLE_HEAD, style: { head: ["green"] } });

  for (const rollout of rollouts) {
    // FIXED: Data access now correctly uses the nested 'definition' object.
    table.push([
      rollout.name,
      rollout.definition.displayName,
      rollout.definition.description,
      rollout.state,
      rollout.createTime,
      rollout.startTime,
      rollout.endTime,
      rollout.lastUpdateTime,
      util.inspect(rollout.definition.controlVariant, { showHidden: false, depth: null }),
      util.inspect(rollout.definition.enabledVariant, { showHidden: false, depth: null }),
      rollout.etag,
    ]);
  }
  return table.toString();
};

/**
 * Retrieves a list of rollouts for a given project and namespace.
 * @param projectId The project ID.
 * @param namespace The namespace of the rollout.
 * @param pageToken Optional token for pagination.
 * @param pageSize Optional size of the page.
 * @param filter Optional filter string.
 * @return A promise that resolves to a list of Remote Config rollouts.
 */
export async function listRollout(
  projectId: string,
  namespace: string,
  pageToken?: string,
  pageSize?: string,
  filter?: string,
): Promise<ListRollouts> {
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

    const res = await apiClient.request<void, ListRollouts>({
      method: "GET",
      // FIXED: Changed 'namespace' to 'namespaces' in the API path for correctness.
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