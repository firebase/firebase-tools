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

type NoteRequest = {
  body: string;
};

export async function addNote(appId: string, issueId: string, note: string): Promise<string> {
  const requestProjectId = parseProjectNumber(appId);
  try {
    const response = await apiClient.request<NoteRequest, string>({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      path: `/projects/${requestProjectId}/apps/${appId}/issues/${issueId}/notes`,
      body: { body: note },
      timeout: TIMEOUT,
    });

    return response.body;
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to add note to issue ${issueId} for app ${appId}. Error: ${err}.`,
      { original: err },
    );
  }
}
