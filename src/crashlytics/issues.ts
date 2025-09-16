import { logger } from "../logger";
import { FirebaseError, getError } from "../error";
import { CRASHLYTICS_API_CLIENT, parseProjectNumber, TIMEOUT } from "./utils";
import { Issue, State, UpdateIssueRequest } from "./types";

/**
 * Fetch a Crashlytics issue.
 * @param appId Firebase app id
 * @param issueId Crashlytics issue id
 * @return Issue details
 */
export async function getIssue(appId: string, issueId: string): Promise<Issue> {
  const requestProjectNumber = parseProjectNumber(appId);

  logger.debug(`[crashlytics] getIssue called with appId: ${appId}, issueId: ${issueId}`);
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
  } catch (err: unknown) {
    throw new FirebaseError(`Failed to fetch issue for appId ${appId}, issueId ${issueId}`, {
      original: getError(err),
    });
  }
}

/**
 * Update the state of a Crashlytics issue.
 * @param appId Firebase app id
 * @param issueId Crashlytics issue id
 * @param state State.OPEN or State.CLOSED
 * @return An updated Issue
 */
export async function updateIssue(appId: string, issueId: string, state: State): Promise<string> {
  const requestProjectNumber = parseProjectNumber(appId);
  try {
    logger.debug(
      `[crashlytics] updateIssue called with appId: ${appId}, issueId: ${issueId}, state: ${state}`,
    );
    await CRASHLYTICS_API_CLIENT.request<UpdateIssueRequest, Issue>({
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      path: `/projects/${requestProjectNumber}/apps/${appId}/issues/${issueId}`,
      queryParams: { updateMask: "state" },
      body: { issue: { state } },
      timeout: TIMEOUT,
    });

    return `Issue ${issueId} state changed to ${state}`;
  } catch (err: unknown) {
    throw new FirebaseError(`Failed to update issue ${issueId} for app ${appId}`, {
      original: getError(err),
    });
  }
}
