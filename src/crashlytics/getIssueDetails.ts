import { logger } from "../logger";
import { FirebaseError } from "../error";
import { CRASHLYTICS_API_CLIENT, parseProjectNumber, TIMEOUT } from "./utils";
import { Issue } from "./types";

export async function getIssueDetails(appId: string, issueId: string): Promise<Issue> {
  const requestProjectNumber = parseProjectNumber(appId);

  logger.debug(
    `[mcp][crashlytics] getIssueDetails called with appId: ${appId}, issueId: ${issueId}`,
  );
  try {
    const response = await CRASHLYTICS_API_CLIENT.request<void, Issue>({
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
