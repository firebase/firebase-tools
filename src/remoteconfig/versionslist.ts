import api = require("../api");
import { FirebaseError } from "../error";
import { ListVersionsResult } from "./interfaces";
import * as logger from "../logger";

const TIMEOUT = 30000;

/**
 * Get a list of Remote Config template versions that have been published, sorted in reverse chronological order for a specific project
 * @param projectId Input is the Project ID string
 * @param maxResults The maximum number of items to return per page
 * @return {Promise<ListVersionsResult>} Returns a Promise of a list of Remote Config template versions that have been published
 */
export async function getVersions(projectId: string, maxResults = 10): Promise<ListVersionsResult> {
  maxResults = maxResults || 300;
  try {
    let request = `/v1/projects/${projectId}/remoteConfig:listVersions`;
    if (maxResults) {
      request = request + "?pageSize=" + maxResults;
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
      `Failed to get Remote Config template versions for Firebase project ${projectId}. `,
      { exit: 2, original: err }
    );
  }
}
