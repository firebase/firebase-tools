import { remoteConfigApiOrigin } from "../api";
import { Client } from "../apiv2";
import { logger } from "../logger";
import { FirebaseError, getErrMsg } from "../error";
import { GetExperimentResult } from "./interfaces";
import * as Table from "cli-table3";
import * as util from "util";

const TIMEOUT = 30000;

const apiClient = new Client({
  urlPrefix: remoteConfigApiOrigin(),
  apiVersion: "v1",
});

export const parseExperimentIntoTable = (experiment: GetExperimentResult): string => {
  const tableHead = ["Entry Name", "Value"];
  const table = new Table({ head: tableHead, style: { head: ["green"] } });
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
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to get Remote Config experiment with ID ${experimentId} for project ${projectId}. Error: ${getErrMsg(err)}}`,
      { original: err },
    );
  }
}
