import { z } from "zod";
import { cloneDeep } from "lodash";
import { logger } from "../logger";
import { CRASHLYTICS_API_CLIENT, parseProjectNumber, TIMEOUT } from "./utils";
import { Report } from "./types";
import {
  ApplicationIdSchema,
  EventFilter,
  EventFilterSchema,
  filterToUrlSearchParams,
} from "./filters";
import { FirebaseError } from "../error";

const DEFAULT_PAGE_SIZE = 10;

export enum CrashlyticsReport {
  TOP_ISSUES = "topIssues",
  TOP_VARIANTS = "topVariants",
  TOP_VERSIONS = "topVersions",
  TOP_OPERATING_SYSTEMS = "topOperatingSystems",
  TOP_APPLE_DEVICES = "topAppleDevices",
  TOP_ANDROID_DEVICES = "topAndroidDevices",
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
 * Returns a report for Crashlytics events.
 * @param report One of the supported reports in the CrashlyticsReport enum
 * @param appId Firebase app_id
 * @param filter The report will count only events matching the given filters
 * @param pageSize Number of rows to return, generally defaulting to 10
 * @return A Report object, grouped appropriately with metrics for eventCount and impactedUsers
 */
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
