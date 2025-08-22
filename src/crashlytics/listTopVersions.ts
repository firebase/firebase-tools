import { logger } from "../logger";
import { FirebaseError } from "../error";
import { CRASHLYTICS_API_CLIENT, parseProjectNumber, TIMEOUT } from "./utils";

export async function listTopVersions(
  appId: string,
  versionCount: number,
  issueId?: string,
): Promise<string> {
  const requestProjectNumber = parseProjectNumber(appId);
  try {
    const queryParams = new URLSearchParams();
    queryParams.set("page_size", `${versionCount}`);
    if (issueId) {
      queryParams.set("filter.issue.id", issueId);
    }

    logger.debug(
      `[mcp][crashlytics] listTopVersions called with appId: ${appId}, versionCount: ${versionCount}, issueId: ${issueId}`,
    );
    const response = await CRASHLYTICS_API_CLIENT.request<void, string>({
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      path: `/projects/${requestProjectNumber}/apps/${appId}/reports/topVersions`,
      queryParams: queryParams,
      timeout: TIMEOUT,
    });

    return response.body;
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to fetch the top versions for the Firebase app id: ${appId}. Error: ${err}.`,
      { original: err },
    );
  }
}
