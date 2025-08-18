import { Client } from "../apiv2";
import { logger } from "../logger";
import { FirebaseError } from "../error";
import { crashlyticsApiOrigin } from "../api";

const TIMEOUT = 10000;

const apiClient = new Client({
  urlPrefix: crashlyticsApiOrigin(),
  apiVersion: "v1alpha",
});

export async function getSampleCrash(
  projectId: string,
  appId: string,
  issueId: string,
  variantId?: string,
  sampleCount?: number,
): Promise<string> {
  try {
    const queryParams = new URLSearchParams();
    queryParams.set("filter.issue.id", `${issueId}`);
    queryParams.set("page_size", String(sampleCount!));
    if (variantId) {
      queryParams.set("filter.issue.variant_id", `${variantId!}`);
    }

    const requestProjectId = parseProjectId(appId);
    if (requestProjectId === undefined) {
      throw new FirebaseError("Unable to get the projectId from the AppId.");
    }

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
      `Failed to fetch the same crash for the Firebase Project ${projectId}, AppId ${appId}, IssueId ${issueId}. Error: ${err}.`,
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
