import * as fs from "fs-extra";
import { Command } from "../command";
import { FirebaseError, getErrMsg, getError } from "../error";
import { logger } from "../logger";
import { Options } from "../options";
import * as prompt from "../prompt";
import { AppPlatform } from "../management/apps";
import { parseAppPlatform } from "./utils";
import { EventFilter, validateEventFilters } from "./filters";

export const VALID_ERROR_TYPES = ["FATAL", "NON_FATAL", "ANR"] as const;
export type IssueErrorType = (typeof VALID_ERROR_TYPES)[number];

export const VALID_SIGNALS = [
  "SIGNAL_EARLY",
  "SIGNAL_FRESH",
  "SIGNAL_REGRESSED",
  "SIGNAL_REPETITIVE",
] as const;
export type IssueSignal = (typeof VALID_SIGNALS)[number];

export const VALID_FORM_FACTORS = ["PHONE", "TABLET", "DESKTOP", "TV", "WATCH"] as const;
export type DeviceFormFactor = (typeof VALID_FORM_FACTORS)[number];

export interface CrashlyticsCommandOptions extends Options {
  app?: string;
  output?: string;
}

export interface CrashlyticsFilterCommandOptions extends CrashlyticsCommandOptions {
  issueId?: string;
  variantId?: string;
  versions?: string;
  errorTypes?: string;
  signals?: string;
  osNames?: string;
  deviceNames?: string;
  deviceFormFactors?: string;
  browserNames?: string;
  startTime?: string;
  endTime?: string;
}

/**
 * Validates that `--app <appId>` was provided and returns the trimmed App ID.
 */
export function requireAppId(options: CrashlyticsCommandOptions): string {
  const appId = typeof options.app === "string" ? options.app.trim() : "";
  if (!appId) {
    throw new FirebaseError(
      "Must specify '--app <appId>'. Run 'firebase apps:list' to find your Firebase App ID.",
      { exit: 1 },
    );
  }
  return appId;
}

/**
 * Parses and validates an optional positive integer CLI flag (such as `--limit` or `--max-frames`).
 */
export function parsePositiveIntOption(
  value: unknown,
  flagName: string,
  bounds: { defaultValue: number; max?: number },
): number {
  const { defaultValue, max } = bounds;
  if (value === undefined || value === "") {
    return defaultValue;
  }
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new FirebaseError(`'${flagName}' must be a positive integer.`, { exit: 1 });
  }
  if (max !== undefined && parsed > max) {
    throw new FirebaseError(`'${flagName}' must be between 1 and ${max}.`, { exit: 1 });
  }
  return parsed;
}

/**
 * Writes raw JSON to `options.output` (`-o, --output <path>`) when requested,
 * prompting for confirmation if the destination file already exists unless `--force` is set.
 * @return true if `-o, --output` was specified (whether written or aborted), false otherwise.
 */
export async function writeOutputFileIfRequested(
  data: unknown,
  options: CrashlyticsCommandOptions,
): Promise<boolean> {
  if (!options.output) {
    return false;
  }
  if (typeof options.output !== "string" || !options.output.trim()) {
    throw new FirebaseError("Must specify a file path for '-o, --output <path>'.", { exit: 1 });
  }
  const outputPath = options.output.trim();
  if (fs.existsSync(outputPath)) {
    const shouldOverwrite = await prompt.confirm({
      message: `File ${outputPath} already exists. Overwrite?`,
      force: options.force,
      nonInteractive: options.nonInteractive,
    });
    if (!shouldOverwrite) {
      logger.info("Aborted writing output file.");
      return true;
    }
  }
  try {
    fs.outputFileSync(outputPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  } catch (err: unknown) {
    throw new FirebaseError(`Failed to write output to ${outputPath}: ${getErrMsg(err)}`, {
      exit: 1,
      original: getError(err),
    });
  }
  logger.info(`Wrote output to ${outputPath}`);
  return true;
}

function splitCommaSeparatedList(raw?: string): string[] | undefined {
  if (!raw) {
    return undefined;
  }
  const items = String(raw)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function validateEnumList<T extends string>(
  values: string[] | undefined,
  validValues: readonly T[],
  flagName: string,
): T[] | undefined {
  if (!values) {
    return undefined;
  }
  for (const val of values) {
    if (!validValues.includes(val as T)) {
      throw new FirebaseError(
        `Invalid value '${val}' for '${flagName}'. Valid values are: ${validValues.join(", ")}.`,
        { exit: 1 },
      );
    }
  }
  return values as T[];
}

/**
 * Registers the shared Crashlytics event filter flags on a CLI Command.
 */
export function withEventFilterOptions(command: Command): Command {
  return command
    .option("--issue-id <id>", "filter by Crashlytics issue ID")
    .option("--variant-id <id>", "filter by issue variant ID (mobile only)")
    .option(
      "--versions <list>",
      'comma-separated version display names (mobile: "2.4.0 (240)", web: "2.4.0")',
    )
    .option("--error-types <list>", "comma-separated error types: FATAL, NON_FATAL, ANR")
    .option(
      "--signals <list>",
      "comma-separated issue signals: SIGNAL_EARLY, SIGNAL_FRESH, SIGNAL_REGRESSED, SIGNAL_REPETITIVE (mobile only)",
    )
    .option(
      "--os-names <list>",
      'comma-separated operating system display names (e.g. "Android (14)")',
    )
    .option(
      "--device-names <list>",
      'comma-separated device display names (e.g. "Google (Pixel 8)", mobile only)',
    )
    .option(
      "--device-form-factors <list>",
      "comma-separated device form factors: PHONE, TABLET, DESKTOP, TV, WATCH (mobile only)",
    )
    .option(
      "--browser-names <list>",
      'comma-separated browser display names (e.g. "Chrome (123)", web only)',
    )
    .option("--start-time <iso>", "start of time interval in ISO 8601 format (within last 90 days)")
    .option("--end-time <iso>", "end of time interval in ISO 8601 format (within last 90 days)");
}

const MOBILE_ONLY_FLAGS: ReadonlyArray<[keyof CrashlyticsFilterCommandOptions, string]> = [
  ["variantId", "--variant-id"],
  ["signals", "--signals"],
  ["deviceNames", "--device-names"],
  ["deviceFormFactors", "--device-form-factors"],
];

const WEB_ONLY_FLAGS: ReadonlyArray<[keyof CrashlyticsFilterCommandOptions, string]> = [
  ["browserNames", "--browser-names"],
];

function validatePlatformSpecificFlags(
  options: CrashlyticsFilterCommandOptions,
  appId: string,
): void {
  const platform = parseAppPlatform(appId);
  if (!platform) {
    return; // Unknown platform segment: let the API decide.
  }
  const isWeb = platform === AppPlatform.WEB;
  const used = (isWeb ? MOBILE_ONLY_FLAGS : WEB_ONLY_FLAGS)
    .filter(([key]) => {
      const value = options[key];
      return typeof value === "string" && value.trim() !== "";
    })
    .map(([, flag]) => flag);
  if (used.length > 0) {
    throw new FirebaseError(
      `${used.join(", ")} ${used.length === 1 ? "is" : "are"} only supported for ` +
        `${isWeb ? "Android and Apple" : "web"} apps, but ${appId} is ` +
        `${isWeb ? "a web" : "an Android or Apple"} app.`,
      { exit: 1 },
    );
  }
}

/**
 * Parses and validates shared CLI filter flags into an `EventFilter` object.
 */
export function parseEventFilters(
  options: CrashlyticsFilterCommandOptions,
  appId: string,
): EventFilter {
  validatePlatformSpecificFlags(options, appId);
  const filter: EventFilter = {
    intervalStartTime: options.startTime?.trim() || undefined,
    intervalEndTime: options.endTime?.trim() || undefined,
    versionDisplayNames: splitCommaSeparatedList(options.versions),
    issueId: options.issueId?.trim() || undefined,
    issueVariantId: options.variantId?.trim() || undefined,
    issueErrorTypes: validateEnumList(
      splitCommaSeparatedList(options.errorTypes),
      VALID_ERROR_TYPES,
      "--error-types",
    ),
    issueSignals: validateEnumList(
      splitCommaSeparatedList(options.signals),
      VALID_SIGNALS,
      "--signals",
    ),
    operatingSystemDisplayNames: splitCommaSeparatedList(options.osNames),
    deviceDisplayNames: splitCommaSeparatedList(options.deviceNames),
    deviceFormFactors: validateEnumList(
      splitCommaSeparatedList(options.deviceFormFactors),
      VALID_FORM_FACTORS,
      "--device-form-factors",
    ),
    browserFilterDisplayNames: splitCommaSeparatedList(options.browserNames),
  };

  try {
    return validateEventFilters(filter, appId);
  } catch (err: unknown) {
    if (err instanceof FirebaseError) {
      if (err.message.includes("topVersions report")) {
        throw new FirebaseError(
          `--versions must match pattern 'version (build)'. Use the displayName values from the topVersions report (e.g. "2.4.0 (240)").`,
          { exit: 1 },
        );
      }
      throw new FirebaseError(err.message, { exit: 1 });
    }
    throw err;
  }
}
