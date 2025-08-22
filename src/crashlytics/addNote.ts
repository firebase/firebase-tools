import { logger } from "../logger";
import { FirebaseError } from "../error";
import { CRASHLYTICS_API_CLIENT, parseProjectNumber, TIMEOUT } from "./utils";

type NoteRequest = {
  body: string;
};

export async function addNote(appId: string, issueId: string, note: string): Promise<string> {
  const requestProjectNumber = parseProjectNumber(appId);
  logger.debug(
    `[mcp][crashlytics] addNote called with appId: ${appId}, issueId: ${issueId}, note: ${note}`,
  );
  try {
    const response = await CRASHLYTICS_API_CLIENT.request<NoteRequest, string>({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      path: `/projects/${requestProjectNumber}/apps/${appId}/issues/${issueId}/notes`,
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
