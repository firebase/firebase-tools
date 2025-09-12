import { z } from "zod";
import { logger } from "../logger";
import { FirebaseError } from "../error";
import { CRASHLYTICS_API_CLIENT, parseProjectNumber, TIMEOUT } from "./utils";
import { Report } from "./types";
import { EventFilter, EventFilterSchema, filterToUrlSearchParams } from "./filters";

export const ApplicationIdSchema = z
  .string()
  .describe(
    "Firebase app id. For an Android application, read the " +
      "mobilesdk_app_id value specified in the google-services.json file for " +
      "the current package name. For an iOS Application, read the GOOGLE_APP_ID " +
      "from GoogleService-Info.plist. If neither is available, ask the user to " +
      "provide the app id.",
  );

export const ReportInputSchema = z.object({
  app_id: ApplicationIdSchema,
  filter: EventFilterSchema,
  pageSize: z.number().optional().describe("Number of rows to return").default(10),
});

export type ReportInput = z.infer<typeof ReportInputSchema>;

const DEFAULT_PAGE_SIZE = 10;

export enum CrashlyticsReport {
  TopIssues = "topIssues",
  TopVariants = "topVariants",
  TopVersions = "topVersions",
  TopOperatingSystems = "topOperatingSystems",
  TopDevices = "topDevices",
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
      `[crashlytics] report ${report} called with appId: ${appId}
       filter: ${queryParams.toString()}, page_size: ${pageSize}`,
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
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(`Failed to fetch ${report} report for app: ${appId}. Error: ${err}.`, {
      original: err,
    });
  }
}
