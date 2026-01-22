import { remoteConfigApiOrigin } from "../api";
import { Client } from "../apiv2";
import { logger } from "../logger";
import { FirebaseError, getError } from "../error";
import { RemoteConfigRollout } from "./interfaces";
import * as Table from "cli-table3";
import * as util from "util";

const TIMEOUT = 30000;
const TABLE_HEAD = ["Entry Name", "Value"];

const apiClient = new Client({
  urlPrefix: remoteConfigApiOrigin(),
  apiVersion: "v1",
});

/**
 * Parses a single rollout object into a CLI table string.
 * @param rollout The rollout object.
 * @return A string formatted as a table.
 */
export const parseRolloutIntoTable = (rollout: RemoteConfigRollout): string => {
  const table = new Table({ head: TABLE_HEAD, style: { head: ["green"] } });
  table.push(
    ["Name", rollout.name],
    ["Display Name", rollout.definition.displayName],
    ["Description", rollout.definition.description],
    ["State", rollout.state],
    ["Create Time", rollout.createTime],
    ["Start Time", rollout.startTime],
    ["End Time", rollout.endTime],
    ["Last Update Time", rollout.lastUpdateTime],
    [
      "Control Variant",
      util.inspect(rollout.definition.controlVariant, { showHidden: false, depth: null }),
    ],
    [
      "Enabled Variant",
      util.inspect(rollout.definition.enabledVariant, { showHidden: false, depth: null }),
    ],
    ["ETag", rollout.etag],
  );
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
    const res = await apiClient.request<void, RemoteConfigRollout>({
      method: "GET",
      path: `/projects/${projectId}/namespaces/${namespace}/rollouts/${rolloutId}`,
      timeout: TIMEOUT,
    });
    return res.body;
  } catch (err: unknown) {
    const error: Error = getError(err);
    logger.debug(error.message);
    throw new FirebaseError(
      `Failed to get Remote Config Rollout with ID ${rolloutId} for project ${projectId}. Error: ${error.message}`,
      { original: error },
    );
  }
}
