import { logger } from "../logger";
import { FirebaseError } from "../error";
import { CRASHLYTICS_API_CLIENT, parseProjectNumber, TIMEOUT } from "./utils";

export async function listNotes(
  appId: string,
  issueId: string,
  noteCount: number,
): Promise<string> {
  const requestProjectNumber = parseProjectNumber(appId);
  try {
    const queryParams = new URLSearchParams();
    queryParams.set("page_size", `${noteCount}`);

    logger.debug(
      `[mcp][crashlytics] listNotes called with appId: ${appId}, issueId: ${issueId}, noteCount: ${noteCount}`,
    );
    const response = await CRASHLYTICS_API_CLIENT.request<void, string>({
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      path: `/projects/${requestProjectNumber}/apps/${appId}/issues/${issueId}/notes`,
      queryParams: queryParams,
      timeout: TIMEOUT,
    });

    return response.body;
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to fetch notes for issue ${issueId} for app ${appId}. Error: ${err}.`,
      { original: err },
    );
  }
}
