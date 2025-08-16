import { Client } from "../apiv2";
import { logger } from "../logger";
import { FirebaseError } from "../error";
import { crashlyticsApiOrigin } from "../api";

const TIMEOUT = 10000;

const apiClient = new Client({
  urlPrefix: crashlyticsApiOrigin(),
  apiVersion: "v1alpha",
});

export async function deleteNote(
  projectId: string,
  appId: string,
  issueId: string,
  noteId: string,
): Promise<void> {
  try {
    const requestProjectId = parseProjectId(appId);
    if (requestProjectId === undefined) {
      throw new FirebaseError("Unable to get the projectId from the AppId.");
    }

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

function parseProjectId(appId: string): string | undefined {
  const appIdParts = appId.split(":");
  if (appIdParts.length > 1) {
    return appIdParts[1];
  }
  return undefined;
}
