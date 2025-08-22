import { logger } from "../logger";
import { FirebaseError } from "../error";
import { CRASHLYTICS_API_CLIENT, parseProjectNumber, TIMEOUT } from "./utils";

export async function listTopIssues(
  appId: string,
  issueType: string,
  issueCount: number,
): Promise<string> {
  const requestProjectNumber = parseProjectNumber(appId);
  try {
    const queryParams = new URLSearchParams();
    queryParams.set("page_size", `${issueCount}`);
    queryParams.set("filter.issue.error_types", `${issueType}`);

    logger.debug(
      `[mcp][crashlytics] listTopIssues called with appId: ${appId}, issueType: ${issueType}, issueCount: ${issueCount}`,
    );
    const response = await CRASHLYTICS_API_CLIENT.request<void, string>({
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      path: `/projects/${requestProjectNumber}/apps/${appId}/reports/topIssues`,
      queryParams: queryParams,
      timeout: TIMEOUT,
    });

    return response.body;
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to fetch the top issues for the Firebase app id: ${appId}. Error: ${err}.`,
      { original: err },
    );
  }
}
