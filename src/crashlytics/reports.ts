import { z } from "zod";
import { cloneDeep } from "lodash";
import { logger } from "../logger";
import { CRASHLYTICS_API_CLIENT, parseProjectNumber, TIMEOUT } from "./utils";
import { ListReportsResponse, Report, TimeGranularity } from "./types";
import {
  ApplicationIdSchema,
  EventFilter,
  EventFilterSchema,
  filterToUrlSearchParams,
} from "./filters";
import { FirebaseError } from "../error";

const DEFAULT_PAGE_SIZE = 10;

export const CrashlyticsReportSchema = z.string().describe("The name of the Crashlytics report");

export const TimeGranularitySchema = z
  .nativeEnum(TimeGranularity)
  .optional()
  .describe(
    "The granularity of time intervals for the report. Returns one data point per time grain, or a single data point for the entire interval if omitted.",
  );

export const ReportInputSchema = z.object({
  appId: ApplicationIdSchema,
  report: CrashlyticsReportSchema,
  filter: EventFilterSchema,
  pageSize: z.number().optional().describe("Number of rows to return").default(DEFAULT_PAGE_SIZE),
  granularity: TimeGranularitySchema,
});

export type ReportInput = z.infer<typeof ReportInputSchema>;

export const reportsCache = new Map<string, ListReportsResponse>();

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
 * @param reportName Name of the report to retrieve
 * @param appId Firebase app_id
 * @param filter The report will count only events matching the given filters
 * @param pageSize Number of rows to return, generally defaulting to 10
 * @param granularity Optional time granularity for report metrics
 * @return A Report object, grouped appropriately with metrics for eventCount and impactedUsers
 */
export async function getReport(
  reportName: string,
  appId: string,
  filter: EventFilter,
  pageSize = DEFAULT_PAGE_SIZE,
  granularity?: TimeGranularity,
): Promise<Report> {
  const requestProjectNumber = parseProjectNumber(appId);
  let availableReports = reportsCache.get(appId);
  if (!availableReports) {
    availableReports = await listReports(appId);
    reportsCache.set(appId, availableReports);
  }

  const validReports = (availableReports.reports ?? [])
    .map((r) => ({
      name: r.name?.split("/").pop(),
      usage: r.usage,
    }))
    .filter((r): r is { name: string; usage: string | undefined } => Boolean(r.name));

  if (!reportName || !validReports.some((r) => r.name === reportName)) {
    const validReportsList = validReports
      .map((r) => (r.usage ? `  * ${r.name} - ${r.usage}` : `  * ${r.name}`))
      .join("\n");
    throw new FirebaseError(
      `Invalid Crashlytics report: ${reportName}. Valid reports are:\n${validReportsList}`,
    );
  }

  const queryParams = filterToUrlSearchParams(filter);
  queryParams.set("page_size", `${pageSize}`);
  if (granularity) {
    queryParams.set("granularity", granularity);
  }
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
