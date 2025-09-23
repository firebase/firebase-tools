import { z } from "zod";
import { logger } from "../logger";
import { FirebaseError, getError } from "../error";
import { CRASHLYTICS_API_CLIENT, parseProjectNumber, TIMEOUT } from "./utils";
import { Report } from "./types";
import {
  ApplicationIdSchema,
  EventFilter,
  EventFilterSchema,
  filterToUrlSearchParams,
} from "./filters";

const DEFAULT_PAGE_SIZE = 10;

export const ReportInputSchema = z.object({
  appId: ApplicationIdSchema,
  filter: EventFilterSchema,
  pageSize: z.number().optional().describe("Number of rows to return").default(DEFAULT_PAGE_SIZE),
});

export type ReportInput = z.infer<typeof ReportInputSchema>;

export enum CrashlyticsReport {
  TopIssues = "topIssues",
  TopVariants = "topVariants",
  TopVersions = "topVersions",
  TopOperatingSystems = "topOperatingSystems",
  TopAppleDevices = "topAppleDevices",
  TopAndroidDevices = "topAndroidDevices",
}

/**
 * Returns a report for Crashlytics events.
 * @param report One of the supported reports in the CrashlyticsReport enum
 * @param appId Firebase app_id
 * @param filter The report will count only events matching the given filters
 * @param pageSize Number of rows to return, generally defaulting to 10
 * @return A Report object, grouped appropriately with metrics for eventCount and impactedUsers
 */
export async function getReport(
  report: CrashlyticsReport,
  appId: string,
  filter: EventFilter,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<Report> {
  const requestProjectNumber = parseProjectNumber(appId);
  try {
    const queryParams = filterToUrlSearchParams(filter);
    queryParams.set("page_size", `${pageSize}`);

    logger.debug(
      `[crashlytics] report ${report} called with appId: ${appId} filter: ${queryParams.toString()}, page_size: ${pageSize}`,
    );
    const response = await CRASHLYTICS_API_CLIENT.request<void, Report>({
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      path: `/projects/${requestProjectNumber}/apps/${appId}/reports/${report}`,
      queryParams: queryParams,
      timeout: TIMEOUT,
    });

    return response.body;
  } catch (err: unknown) {
    throw new FirebaseError(`Failed to fetch ${report} report for app: ${appId}`, {
      original: getError(err),
    });
  }
}
