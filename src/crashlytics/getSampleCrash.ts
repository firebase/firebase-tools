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

export async function getSampleCrash(
  appId: string,
  issueId: string,
  sampleCount: number,
  variantId?: string,
): Promise<string> {
  const requestProjectId = parseProjectNumber(appId);
  try {
    const queryParams = new URLSearchParams();
    queryParams.set("filter.issue.id", issueId);
    queryParams.set("page_size", String(sampleCount));
    if (variantId) {
      queryParams.set("filter.issue.variant_id", variantId);
    }

    logger.debug(`[mcp][crashlytics] getSampleCrash query paramaters: ${queryParams}`);
    const response = await apiClient.request<void, string>({
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      path: `/projects/${requestProjectId}/apps/${appId}/events`,
      queryParams: queryParams,
      timeout: TIMEOUT,
    });

    return response.body;
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to fetch the same crash for the Firebase AppId ${appId}, IssueId ${issueId}. Error: ${err}.`,
      { original: err },
    );
  }
}
