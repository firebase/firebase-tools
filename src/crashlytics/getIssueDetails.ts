import { logger } from "../logger";
import { FirebaseError } from "../error";
import { CRASHLYTICS_API_CLIENT, parseProjectNumber, TIMEOUT } from "./utils";

export async function getIssueDetails(appId: string, issueId: string): Promise<string> {
  const requestProjectNumber = parseProjectNumber(appId);

  logger.debug(
    `[mcp][crashlytics] getIssueDetails called with appId: ${appId}, issueId: ${issueId}`,
  );
  try {
    const response = await CRASHLYTICS_API_CLIENT.request<void, string>({
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      path: `/projects/${requestProjectNumber}/apps/${appId}/issues/${issueId}`,
      timeout: TIMEOUT,
    });

    return response.body;
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to fetch the issue details for the Firebase AppId ${appId}, IssueId ${issueId}. Error: ${err}.`,
      { original: err },
    );
  }
}
