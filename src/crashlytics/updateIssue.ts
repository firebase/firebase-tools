import { logger } from "../logger";
import { FirebaseError } from "../error";
import { CRASHLYTICS_API_CLIENT, parseProjectNumber, TIMEOUT } from "./utils";
import { Issue, State, UpdateIssueRequest } from "./types";

export async function updateIssue(appId: string, issueId: string, state: State): Promise<Issue> {
  const requestProjectNumber = parseProjectNumber(appId);
  try {
    logger.debug(
      `[mcp][crashlytics] updateIssue called with appId: ${appId}, issueId: ${issueId}, state: ${state}`,
    );
    const response = await CRASHLYTICS_API_CLIENT.request<UpdateIssueRequest, Issue>({
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      path: `/projects/${requestProjectNumber}/apps/${appId}/issues/${issueId}`,
      queryParams: { updateMask: "state" },
      body: { issue: { state } },
      timeout: TIMEOUT,
    });

    return response.body;
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(`Failed to update issue ${issueId} for app ${appId}. Error: ${err}.`, {
      original: err,
    });
  }
}
