import { z } from "zod";
import { FirebaseError } from "../error";

export const ApplicationIdSchema = z
  .string()
  .describe("Firebase App Id. Strictly required for all API calls.");

export const IssueIdSchema = z.string().describe("Crashlytics issue id, as hexidecimal UUID");

export const EventFilterSchema = z
  .object({
    intervalStartTime: z
      .string()
      .optional()
      .describe(
        `A timestamp in ISO 8601 string format. Must be within the last 90 days. Defaults to 7 days ago.`,
      ),
    intervalEndTime: z
      .string()
      .optional()
      .describe(
        `A timestamp in ISO 8601 string format. Must be within the last 90 days. Defaults to now.`,
      ),
    versionDisplayNames: z
      .array(z.string())
      .optional()
      .describe(
        `Counts events originating from the given app versions. Must be obtained from the *displayName* field in an API response. `,
      ),
    issueId: z.string().optional().describe(`Count events for the given issue`),
    issueVariantId: z.string().optional().describe(`Count events for the given issue variant`),
    issueErrorTypes: z
      .array(z.enum(["FATAL", "NON_FATAL", "ANR"]))
      .optional()
      .describe(
        `Counts FATAL events (crashes), NON_FATAL events (exceptions) or ANR events (application not responding)`,
      ),
    issueSignals: z
      .array(z.enum(["SIGNAL_EARLY", "SIGNAL_FRESH", "SIGNAL_REGRESSED", "SIGNAL_REPETITIVE"]))
      .optional()
      .describe(`Counts events matching the given signals`),
    operatingSystemDisplayNames: z
      .array(z.string())
      .optional()
      .describe(
        `Counts events originating from the given operating systems. Must be obtained from the *displayName* field in an API response.`,
      ),
    deviceDisplayNames: z
      .array(z.string())
      .optional()
      .describe(`Must be obtained from the *displayName* field in an API response.`),
    deviceFormFactors: z
      .array(z.enum(["PHONE", "TABLET", "DESKTOP", "TV", "WATCH"]))
      .optional()
      .describe(`Counts events originating from the given device form factors`),
  })
  .optional()
  .describe(`Only events matching the given filters will be counted. All filters are optional. 
    If setting a time interval, set both intervalStartTime and intervalEndTime.`);

export type EventFilter = z.infer<typeof EventFilterSchema>;

// Most models seem to understand the flattened, camelCase representation better.
// This maps those strings to the filter params the API expects.

const toolToParamMap: Record<string, string> = {
  intervalStartTime: "filter.interval.start_time",
  intervalEndTime: "filter.interval.end_time",
  versionDisplayNames: "filter.version.display_names",
  issueId: "filter.issue.id",
  issueVariantId: "filter.issue.variant_id",
  issueErrorTypes: "filter.issue.error_types",
  issueSignals: "filter.issue.signals",
  operatingSystemDisplayNames: "filter.operating_system.display_names",
  deviceDisplayNames: "filter.device.display_names",
  deviceFormFactors: "filter.device.form_factors",
};

/**
 * Converts the model-friendly, flattened camelCase tool parameters into the
 * AIP-160 style url parameters for all of the filtering options.
 * @param filter an EventFilter
 * @return URLSearchParams for a request to the GetReport endpoint
 */
export function filterToUrlSearchParams(filter: EventFilter): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter || {})) {
    if (value === undefined) {
      continue;
    }
    const paramKey: string = toolToParamMap[key];
    if (Array.isArray(value)) {
      for (const v of value) {
        params.append(paramKey, v);
      }
    } else if (value) {
      params.set(paramKey, value);
    }
  }
  return params;
}

const displayNamePattern = /^[^()]+\s+\([^()]+\)$/; // Regular expression like "xxxx (yyy)"

/**
 * Perform some simplistic validation on filters and fill missing values.
 * @param filter filters to validate
 * @throws FirebaseError if any of the filters are invalid.
 */
export function validateEventFilters(filter: EventFilter = {}): EventFilter {
  if (!!filter.intervalStartTime && !filter.intervalEndTime) {
    // interval.end_time is required if interval.start_time is set but the agent likes to forget it
    filter.intervalEndTime = new Date().toISOString();
  }
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  if (filter.intervalStartTime && new Date(filter.intervalStartTime) < ninetyDaysAgo) {
    throw new FirebaseError("intervalStartTime must be less than 90 days in the past");
  }
  if (filter.deviceDisplayNames) {
    filter.deviceDisplayNames.forEach((dn) => {
      if (!displayNamePattern.test(dn)) {
        throw new FirebaseError("deviceDisplayNames must match pattern 'manufacturer (device)'");
      }
    });
  }
  if (filter.operatingSystemDisplayNames) {
    filter.operatingSystemDisplayNames.forEach((dn) => {
      if (!displayNamePattern.test(dn)) {
        throw new FirebaseError("operatingSystemDisplayNames must match pattern 'os (version)'");
      }
    });
  }
  if (filter.versionDisplayNames) {
    filter.versionDisplayNames.forEach((dn) => {
      if (!displayNamePattern.test(dn)) {
        throw new FirebaseError("versionDisplayNames must match pattern 'version (build)'");
      }
    });
  }
  return filter;
}
