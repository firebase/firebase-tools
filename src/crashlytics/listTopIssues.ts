import { Client } from "../apiv2";
import { logger } from "../logger";
import { FirebaseError } from "../error";
import { crashlyticsApiOrigin } from "../api";
import { FirebaseFilters, FirebaseFilterInterval, listTopIssuesParams, PageDetails } from "./paramInterface";

const TIMEOUT = 10000;

const apiClient = new Client({
    urlPrefix: crashlyticsApiOrigin(),
    apiVersion: "v1",
  });

export async function listTopIssues(
    projectId: string,
    platform: string,
    packageName: string, 
    issueCount: number,
    lookbackPeriod: number,
): Promise<string> {
    try {
        const filters: FirebaseFilters = {
            categories: [],
            customKeys: [],
            eventType: ["FATAL"],
            hasCrashlyticsInsights: false,
            manufacturerModels: [],
            osVersions: [],
            rollouts: [],
        }

        const now = new Date();
        const pastDate = new Date(Date.now() - (lookbackPeriod * 24 * 60 * 60 * 1000));
        const timeInterval: FirebaseFilterInterval = {
            startTime: pastDate.toISOString(),
            endTime: now.toISOString()
        }

        const pageDetails: PageDetails = {
            pageSize: issueCount,
            pageToken: "",
        }

        const params: listTopIssuesParams = {
            filters : filters,
            interval: timeInterval,
            orderBy : "ORDER_EVENTS",
            pageDetails: pageDetails,
        }
        const response = await apiClient.request<void, string>({
            method: "GET",
            path: `/projects/${projectId}/${platform}:${packageName}/metrics:listFirebaseTopOpenIssues`,
            body: JSON.stringify(params),
            timeout: TIMEOUT,
          });
          return response.body;
    } catch (err: any) {
        logger.debug(err.message);
        throw new FirebaseError(
            'Failed to fetch the top issues for the Firebase Project ${projectId}, PackageName ${packageName}.',
            { original: err}
        );
    }
}