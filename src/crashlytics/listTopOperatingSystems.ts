import { Client } from "../apiv2";
import { logger } from "../logger";
import { FirebaseError } from "../error";
import { crashlyticsApiOrigin } from "../api";
import { parseProjectNumber } from "./utils";

const TIMEOUT = 10000;

const apiClient = new Client({
  urlPrefix: crashlyticsApiOrigin(),
  apiVersion: "v1alpha",
});

export async function listTopOperatingSystems(
  appId: string,
  osCount: number,
  issueId?: string,
): Promise<string> {
  const requestProjectId = parseProjectNumber(appId);
  try {
    const queryParams = new URLSearchParams();
    queryParams.set("page_size", `${osCount}`);
    if (issueId) {
      queryParams.set("filter.issue.id", issueId);
    }

    logger.debug(`[mcp][crashlytics] listTopOperatingSystems query paramaters: ${queryParams}`);
    const response = await apiClient.request<void, string>({
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      path: `/projects/${requestProjectId}/apps/${appId}/reports/topOperatingSystems`,
      queryParams: queryParams,
      timeout: TIMEOUT,
    });

    return response.body;
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to fetch the top operating systems for the Firebase app id: ${appId}. Error: ${err}.`,
      { original: err },
    );
  }
}
