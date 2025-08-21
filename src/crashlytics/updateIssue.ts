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
  const requestProjectId = parseProjectNumber(appId);
  try {
    const response = await apiClient.request<UpdateIssueRequest, Issue>({
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      path: `/projects/${requestProjectId}/apps/${appId}/issues/${issueId}`,
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
