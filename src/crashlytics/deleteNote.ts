import { logger } from "../logger";
import { FirebaseError } from "../error";
import { CRASHLYTICS_API_CLIENT, parseProjectNumber, TIMEOUT } from "./utils";

export async function deleteNote(appId: string, issueId: string, noteId: string): Promise<string> {
  const requestProjectNumber = parseProjectNumber(appId);

  logger.debug(
    `[mcp][crashlytics] deleteNote called with appId: ${appId}, issueId: ${issueId}, noteId: ${noteId}`,
  );
  try {
    await CRASHLYTICS_API_CLIENT.request<void, void>({
      method: "DELETE",
      path: `/projects/${requestProjectNumber}/apps/${appId}/issues/${issueId}/notes/${noteId}`,
      timeout: TIMEOUT,
    });
    return `Successfully deleted note ${noteId} from issue ${issueId}.`;
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to delete note ${noteId} from issue ${issueId} for app ${appId}. Error: ${err}.`,
      { original: err },
    );
  }
}
