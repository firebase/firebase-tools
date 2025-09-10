import { remoteConfigApiOrigin } from "../api";
import { Client } from "../apiv2";
import { logger } from "../logger";
import { FirebaseError, getError } from "../error";
// FIXED: Changed type to RemoteConfigRollout for consistency with your interfaces file.
import { RemoteConfigRollout } from "./interfaces";
import * as Table from "cli-table3";

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
  "ETag", // FIXED: Capitalized for consistency.
];

/**
 * Parses a single rollout object into a CLI table string.
 * @param rollout The rollout object.
 * @return A string formatted as a table.
 */
export const parseRolloutIntoTable = (rollout: RemoteConfigRollout): string => {
  const table = new Table({ head: TABLE_HEAD, style: { head: ["green"] } });
  table.push([
    rollout.name,
    rollout.definition.displayName,
    rollout.definition.description,
    rollout.state,
    rollout.createTime,
    rollout.startTime,
    rollout.endTime,
    rollout.lastUpdateTime,
    // FIXED: Accessed the .name property to display the variant name string instead of [object Object].
    rollout.definition.controlVariant.name,
    rollout.definition.enabledVariant.name,
    rollout.etag,
  ]);
  return table.toString();
};

/**
 * Retrieves a specific rollout by its ID.
 * @param projectId The project ID.
 * @param namespace The namespace of the rollout.
 * @param rolloutId The ID of the rollout to retrieve.
 * @return A promise that resolves to the requested Remote Config rollout.
 */
export async function getRollout(
  projectId: string,
  namespace: string,
  rolloutId: string,
): Promise<RemoteConfigRollout> {
  try {
    const res = await apiClient.request<null, RemoteConfigRollout>({
      method: "GET",
      // FIXED: Corrected API path to use plural 'namespaces' and 'rollouts'.
      path: `/projects/${projectId}/namespaces/${namespace}/rollouts/${rolloutId}`,
      timeout: TIMEOUT,
    });
    return res.body;
  } catch (err: unknown) {
    const error: Error = getError(err);
    logger.debug(error.message);
    // FIXED: Removed extra closing brace in the error message string.
    throw new FirebaseError(
      `Failed to get Remote Config Rollout with ID ${rolloutId} for project ${projectId}. Error: ${error.message}`,
      { original: error },
    );
  }
}