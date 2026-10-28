import { z } from "zod";
import { cloneDeep } from "lodash";
import { logger } from "../logger";
import { CRASHLYTICS_API_CLIENT, parseProjectNumber, TIMEOUT } from "./utils";
import { ListReportsResponse, Report } from "./types";
import {
  ApplicationIdSchema,
  EventFilter,
  EventFilterSchema,
  filterToUrlSearchParams,
} from "./filters";
import { FirebaseError } from "../error";

const DEFAULT_PAGE_SIZE = 10;

export enum CrashlyticsReport {
  APP_SUMMARY = "appSummary",
  RELEASE_VERSIONS = "releaseVersions",
  TOP_ISSUES = "topIssues",
  TOP_VARIANTS = "topVariants",
  TOP_VERSIONS = "topVersions",
  TOP_OPERATING_SYSTEMS = "topOperatingSystems",
  TOP_APPLE_DEVICES = "topAppleDevices",
  TOP_ANDROID_DEVICES = "topAndroidDevices",
  TOP_BROWSERS = "topBrowsers",
  TOP_CUSTOM_KEYS = "topCustomKeys",
}

export const CrashlyticsReportSchema = z.nativeEnum(CrashlyticsReport);

export const ReportInputSchema = z.object({
  appId: ApplicationIdSchema,
  report: CrashlyticsReportSchema,
  filter: EventFilterSchema,
  pageSize: z.number().optional().describe("Number of rows to return").default(DEFAULT_PAGE_SIZE),
});

export type ReportInput = z.infer<typeof ReportInputSchema>;

/**
 * Removes fields from the report which confuse the model
 */
export function simplifyReport(report: Report): Report {
  const simplifiedReport = cloneDeep(report);
  if (!simplifiedReport.groups) return report;
  simplifiedReport.groups.forEach((group) => {
    // Leaves displayName only in each group, which is the appropriate field to use
    if (group.device) {
      delete group.device.model;
      delete group.device.manufacturer;
    }
    if (group.version) {
      delete group.version.buildVersion;
      delete group.version.displayVersion;
    }
    if (group.operatingSystem) {
      delete group.operatingSystem.displayVersion;
      delete group.operatingSystem.os;
    }
  });
  return simplifiedReport;
}

/**
 * Lists all Crashlytics reports available for the given Firebase app.
 * @param appId Firebase app_id
 * @return A ListReportsResponse containing report names and usage descriptions
 */
export async function listReports(appId: string): Promise<ListReportsResponse> {
  const requestProjectNumber = parseProjectNumber(appId);
  logger.debug(`[crashlytics] listReports called with appId: ${appId}`);
  const response = await CRASHLYTICS_API_CLIENT.request<void, ListReportsResponse>({
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    path: `/projects/${requestProjectNumber}/apps/${appId}/reports`,
    timeout: TIMEOUT,
  });
  response.body.reports ??= [];
  return response.body;
}

/**
 * Returns a report for Crashlytics events.
 * @param reportName One of the supported reports in the CrashlyticsReport enum
 * @param appId Firebase app_id
 * @param filter The report will count only events matching the given filters
 * @param pageSize Number of rows to return, generally defaulting to 10
 * @return A Report object, grouped appropriately with metrics for eventCount and impactedUsers
 */
export async function getReport(
  reportName: CrashlyticsReport,
  appId: string,
  filter: EventFilter,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<Report> {
  if (!reportName) {
    throw new FirebaseError("Invalid Crashlytics report " + reportName);
  }
  const requestProjectNumber = parseProjectNumber(appId);
  const queryParams = filterToUrlSearchParams(filter);
  queryParams.set("page_size", `${pageSize}`);
  logger.debug(
    `[crashlytics] report ${reportName} called with appId: ${appId} filter: ${queryParams.toString()}, page_size: ${pageSize}`,
  );
  const response = await CRASHLYTICS_API_CLIENT.request<void, Report>({
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    path: `/projects/${requestProjectNumber}/apps/${appId}/reports/${reportName}`,
    queryParams: queryParams,
    timeout: TIMEOUT,
  });
  return response.body;
}
