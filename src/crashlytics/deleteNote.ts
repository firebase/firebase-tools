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

export async function deleteNote(appId: string, issueId: string, noteId: string): Promise<void> {
  const requestProjectId = parseProjectNumber(appId);
  try {
    await apiClient.request<void, void>({
      method: "DELETE",
      path: `/projects/${requestProjectId}/apps/${appId}/issues/${issueId}/notes/${noteId}`,
      timeout: TIMEOUT,
    });
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to delete note ${noteId} from issue ${issueId} for app ${appId}. Error: ${err}.`,
      { original: err },
    );
  }
}
