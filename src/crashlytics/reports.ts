import { z } from "zod";
import { logger } from "../logger";
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
/**
 * Removes fields from the report which confuse the model
 */
export function simplifyReport(report: Report): Report {
  if (!report.groups) return report;
  report.groups.forEach((group) => {
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
  return report;
}

export async function getReport(
  report: CrashlyticsReport,
  appId: string,
  filter: EventFilter,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<Report> {
  const requestProjectNumber = parseProjectNumber(appId);
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
}
