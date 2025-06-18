import { Client } from "../apiv2";
import { logger } from "../logger";
import { FirebaseError } from "../error";
import { crashlyticsApiOrigin } from "../api";

const TIMEOUT = 10000;

const apiClient = new Client({
  urlPrefix: crashlyticsApiOrigin(),
  apiVersion: "v1alpha",
});

export async function listTopIssues(
  projectId: string,
  appId: string,
  issueType: string,
  issueCount: number,
): Promise<string> {
  try {
    const queryParams = new URLSearchParams();
    queryParams.set("page_size", `${issueCount}`);
    queryParams.set("filter.issue.error_types", `${issueType}`);

    const requestProjectId = parseProjectId(appId);
    if (requestProjectId === undefined) {
      throw new FirebaseError("Unable to get the projectId from the AppId.");
    }

    const response = await apiClient.request<void, string>({
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      path: `/projects/${requestProjectId}/apps/${appId}/reports/topIssues`,
      queryParams: queryParams,
      timeout: TIMEOUT,
    });

    return response.body;
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to fetch the top issues for the Firebase Project ${projectId}, AppId ${appId}. Error: ${err}.`,
      { original: err },
    );
  }
}

function parseProjectId(appId: string): string | undefined {
  const appIdParts = appId.split(":");
  if (appIdParts.length > 1) {
    return appIdParts[1];
  }
  return undefined;
}
