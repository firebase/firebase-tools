import { logger } from "../logger";
import { FirebaseError } from "../error";
import { CRASHLYTICS_API_CLIENT, parseProjectNumber, TIMEOUT } from "./utils";

export enum IssueState {
  OPEN = "OPEN",
  CLOSED = "CLOSED",
}

type UpdateIssueRequest = {
  state: IssueState;
};

// Based on https://cloud.google.com/firebase/docs/reference/crashlytics/rest/v1/projects.apps.issues#resource:-issue
type Issue = {
  name: string;
  issueId: string;
  state: IssueState;
};

export async function updateIssue(
  appId: string,
  issueId: string,
  state: IssueState,
): Promise<Issue> {
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
      body: { state },
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
