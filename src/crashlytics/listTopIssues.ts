import { Client } from "../apiv2";
import { logger } from "../logger";
import { FirebaseError } from "../error";
import { crashlyticsApiOrigin } from "../api";

const TIMEOUT = 10000;

const apiClient = new Client({
  urlPrefix: crashlyticsApiOrigin(),
  apiVersion: "v1main",
});

export async function listTopIssues(
  projectId: string,
  appId: string,
  issueCount: number,
  lookbackDays: number,
): Promise<string> {
  try {
    const now = new Date();
    const pastDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

    const queryParams = new URLSearchParams();
    queryParams.set("page_size", `${issueCount}`);
    queryParams.set("filters.interval.start_time", pastDate.toISOString());
    queryParams.set("filters.interval.end_time", now.toISOString());

    const response = await apiClient.request<void, string>({
      method: "GET",
      path: `/projects/-/apps/${appId}/reports/topIssues`,
      queryParams: queryParams,
      timeout: TIMEOUT,
    });
    return response.body;
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to fetch the top issues for the Firebase Project ${projectId}, AppId ${appId}. Error: ${err}.`,
      { original: err },
    );
  }
}
