import api = require("../api");
import * as logger from "../logger";
import { FirebaseError } from "../error";
import { ListVersionsResult } from "./interfaces";

const TIMEOUT = 30000;

/**
 * Function retrieves the list of versions for a specific project
 * @param projectId Input is the Project ID string
 * @return {Promise} Returns a promise of the result when calling listVersions method
 */
export async function getVersions(projectId: string): Promise<ListVersionsResult> {
  try {
    const request = `/v1/projects/${projectId}/remoteConfig:listVersions`;
    const response = await api.request("GET", request, {
      auth: true,
      origin: api.remoteConfigApiOrigin,
      timeout: TIMEOUT,
    });
    return response.body;
  } catch (err) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to get versions for Firebase project ${projectId}. ` +
        "Please make sure the project exists and your account has permission to access it.",
      { exit: 2, original: err }
    );
  }
}
