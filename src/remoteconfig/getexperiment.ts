import * as Table from "cli-table3";
import * as util from "util";

import { remoteConfigApiOrigin } from "../api";
import { Client } from "../apiv2";
import { logger } from "../logger";
import { FirebaseError, getError } from "../error";
import { GetExperimentResult } from "./interfaces";

const TIMEOUT = 30000;
const TABLE_HEAD = ["Entry Name", "Value"];

const apiClient = new Client({
  urlPrefix: remoteConfigApiOrigin(),
  apiVersion: "v1",
});

/**
 * Parses a Remote Config experiment object and formats it into a table.
 * @param experiment The Remote Config experiment.
 * @return A tabular representation of the experiment.
 */
export const parseExperiment = (experiment: GetExperimentResult): string => {
  const table = new Table({ head: TABLE_HEAD, style: { head: ["green"] } });
  table.push(["Name", experiment.name]);
  table.push(["Display Name", experiment.definition.displayName]);
  table.push(["Service", experiment.definition.service]);
  table.push([
    "Objectives",
    util.inspect(experiment.definition.objectives, { showHidden: false, depth: null }),
  ]);
  table.push([
    "Variants",
    util.inspect(experiment.definition.variants, { showHidden: false, depth: null }),
  ]);
  table.push(["State", experiment.state]);
  table.push(["Start Time", experiment.startTime]);
  table.push(["End Time", experiment.endTime]);
  table.push(["Last Update Time", experiment.lastUpdateTime]);
  table.push(["etag", experiment.etag]);
  return table.toString();
};

/**
 * Returns a Remote Config experiment.
 * @param projectId The ID of the project.
 * @param namespace The namespace under which the experiment is created.
 * @param experimentId The ID of the experiment to retrieve.
 * @return A promise that resolves to the experiment object.
 */
export async function getExperiment(
  projectId: string,
  namespace: string,
  experimentId: string,
): Promise<GetExperimentResult> {
  try {
    const res = await apiClient.request<void, GetExperimentResult>({
      method: "GET",
      path: `projects/${projectId}/namespaces/${namespace}/experiments/${experimentId}`,
      timeout: TIMEOUT,
    });
    return res.body;
  } catch (err: unknown) {
    const error: Error = getError(err);
    logger.debug(error.message);
    throw new FirebaseError(
      `Failed to get Remote Config experiment with ID ${experimentId} for project ${projectId}. Error: ${error.message}}`,
      { original: error },
    );
  }
}
