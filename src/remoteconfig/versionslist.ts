import api = require("../api");
import { FirebaseError } from "../error";
import { ListVersionsResult } from "./interfaces";
import * as logger from "../logger";

const TIMEOUT = 30000;

/**
 * Get a list of Remote Config template versions that have been published, sorted in reverse chronological order for a specific project
 * @param projectId Input is the Project ID string
 * @return {Promise<ListVersionsResult>} Returns a Promise of a list of Remote Config template versions that have been published
 */
export async function getVersions(
  projectId: string,
  pageSize?: number
): Promise<ListVersionsResult> {
  try {
    let request = `/v1/projects/${projectId}/remoteConfig:listVersions`;
    if (pageSize) {
      request = request + "?pageSize=" + pageSize;
    }
    const response = await api.request("GET", request, {
      auth: true,
      origin: api.remoteConfigApiOrigin,
      timeout: TIMEOUT,
    });
    return response.body;
  } catch (err) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to get Remote Config template versions for Firebase project ${projectId}. ` +
        "Please make sure the project exists and your account has permission to access it.",
      { exit: 2, original: err }
    );
  }
}
