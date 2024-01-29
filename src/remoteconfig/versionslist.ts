import { remoteConfigApiOrigin } from "../api";
import { Client } from "../apiv2";
import { FirebaseError } from "../error";
import { ListVersionsResult } from "./interfaces";
import { logger } from "../logger";

const apiClient = new Client({
  urlPrefix: remoteConfigApiOrigin,
  apiVersion: "v1",
});

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
    const params = new URLSearchParams();
    if (maxResults) {
      params.set("pageSize", `${maxResults}`);
    }
    const response = await apiClient.request<void, ListVersionsResult>({
      method: "GET",
      path: `/projects/${projectId}/remoteConfig:listVersions`,
      queryParams: params,
      timeout: TIMEOUT,
    });
    return response.body;
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to get Remote Config template versions for Firebase project ${projectId}. `,
      { original: err },
    );
  }
}
