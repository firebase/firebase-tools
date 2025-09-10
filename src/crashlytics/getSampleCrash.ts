import { logger } from "../logger";
import { FirebaseError } from "../error";
import { CRASHLYTICS_API_CLIENT, parseProjectNumber, TIMEOUT } from "./utils";
import { ListEventsResponse } from "./types";

export async function getSampleCrash(
  appId: string,
  issueId: string,
  sampleCount: number,
  variantId?: string,
): Promise<ListEventsResponse> {
  const requestProjectNumber = parseProjectNumber(appId);

  logger.debug(
    `[mcp][crashlytics] getSampleCrash called with appId: ${appId}, issueId: ${issueId}, sampleCount: ${sampleCount}, variantId: ${variantId}`,
  );
  try {
    const queryParams = new URLSearchParams();
    queryParams.set("filter.issue.id", issueId);
    queryParams.set("page_size", String(sampleCount));
    if (variantId) {
      queryParams.set("filter.issue.variant_id", variantId);
    }

    logger.debug(`[mcp][crashlytics] getSampleCrash query paramaters: ${queryParams}`);
    const response = await CRASHLYTICS_API_CLIENT.request<void, unknown>({
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      path: `/projects/${requestProjectNumber}/apps/${appId}/events`,
      queryParams: queryParams,
      timeout: TIMEOUT,
    });

    return response.body as ListEventsResponse;
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to fetch the same crash for the Firebase AppId ${appId}, IssueId ${issueId}. Error: ${err}.`,
      { original: err },
    );
  }
}
