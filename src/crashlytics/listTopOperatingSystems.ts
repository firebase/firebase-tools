import { logger } from "../logger";
import { FirebaseError } from "../error";
import { CRASHLYTICS_API_CLIENT, parseProjectNumber, TIMEOUT } from "./utils";

export async function listTopOperatingSystems(
  appId: string,
  osCount: number,
  issueId?: string,
): Promise<string> {
  const requestProjectNumber = parseProjectNumber(appId);
  try {
    const queryParams = new URLSearchParams();
    queryParams.set("page_size", `${osCount}`);
    if (issueId) {
      queryParams.set("filter.issue.id", issueId);
    }

    logger.debug(
      `[mcp][crashlytics] listTopOperatingSystems called with appId: ${appId}, osCount: ${osCount}, issueId: ${issueId}`,
    );
    const response = await CRASHLYTICS_API_CLIENT.request<void, string>({
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      path: `/projects/${requestProjectNumber}/apps/${appId}/reports/topOperatingSystems`,
      queryParams: queryParams,
      timeout: TIMEOUT,
    });

    return response.body;
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to fetch the top operating systems for the Firebase app id: ${appId}. Error: ${err}.`,
      { original: err },
    );
  }
}
