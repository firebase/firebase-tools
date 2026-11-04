import { dump } from "js-yaml";

import { Command } from "../command";
import {
  CrashlyticsFilterCommandOptions,
  parseEventFilters,
  parsePositiveIntOption,
  requireAppId,
  withEventFilterOptions,
  writeOutputFileIfRequested,
} from "../crashlytics/commandUtils";
import { DEFAULT_MAX_FRAMES, EVENT_DUMP_OPTIONS, listEvents, toText } from "../crashlytics/events";
import { ListEventsResponse } from "../crashlytics/types";
import { parseAppPlatform } from "../crashlytics/utils";
import { FirebaseError, getErrMsg, getError, getErrStatus } from "../error";
import { logger } from "../logger";
import { AppPlatform } from "../management/apps";
import { requireAuth } from "../requireAuth";

export interface EventsListOptions extends CrashlyticsFilterCommandOptions {
  filter?: string;
  limit?: string | number;
  maxFrames?: string | number;
  full?: boolean;
}

function missingIssueIdMessage(appId: string): string {
  const platform = parseAppPlatform(appId);
  if (platform === AppPlatform.WEB) {
    return "Must specify '--issue-id <id>' to list events.";
  }
  if (platform === AppPlatform.ANDROID || platform === AppPlatform.IOS) {
    return "Must specify '--issue-id <id>' or '--variant-id <id>' to list events.";
  }
  return "Must specify '--issue-id <id>' (or '--variant-id <id>' for Android/Apple apps) to list events.";
}

export const command = withEventFilterOptions(new Command("crashlytics:events:list"))
  .description("list the most recent Crashlytics events matching the given filters")
  .option("--app <appId>", "the Firebase App ID")
  .option(
    "--filter <expression>",
    "AIP-160 filter expression for custom keys (e.g. 'custom_keys.env = \"prod\"')",
  )
  .option("-n, --limit <number>", "maximum number of events to return (1-100, default: 1)")
  .option(
    "--max-frames <number>",
    `maximum stack frames per thread or exception (default: ${DEFAULT_MAX_FRAMES}, ignored when --full is set)`,
  )
  .option("--full", "include all threads, stack frames, logs, and breadcrumbs without truncation")
  .option("-o, --output <path>", "write raw JSON output to a file")
  .withForce("overwrite output file without prompting")
  .help(
    `Lists the most recent Crashlytics events matching the specified filters.
Requires --issue-id (or --variant-id for Android/Apple apps).

Custom Key Filtering (--filter):
  Filter events by Crashlytics custom keys using AIP-160 syntax:
  - Exact match:    --filter 'custom_keys.env = "prod"'
  - Key presence:   --filter 'custom_keys.experiment_id:*'
  - Multiple keys:  --filter 'custom_keys.env = "prod" AND custom_keys.role = "admin"'
  - Multiple vals:  --filter 'custom_keys.env = "prod" OR custom_keys.env = "staging"'
  OR is only supported between values of the same key.`,
  )
  .before(requireAuth)
  .action(async (options: EventsListOptions): Promise<ListEventsResponse> => {
    const appId = requireAppId(options);
    const filter = parseEventFilters(options, appId);
    if (!filter?.issueId && !filter?.issueVariantId) {
      throw new FirebaseError(missingIssueIdMessage(appId), { exit: 1 });
    }

    const limit = parsePositiveIntOption(options.limit, "--limit", {
      defaultValue: 1,
      max: 100,
    });
    const maxFrames = parsePositiveIntOption(options.maxFrames, "--max-frames", {
      defaultValue: DEFAULT_MAX_FRAMES,
    });
    const filterExpression =
      typeof options.filter === "string" ? options.filter.trim() || undefined : undefined;

    let response: ListEventsResponse;
    try {
      response = await listEvents(appId, filter, limit, filterExpression);
    } catch (err: unknown) {
      const status = getErrStatus(err);
      const message = getErrMsg(err);
      if (filterExpression && (status === 400 || message.includes("INVALID_ARGUMENT"))) {
        throw new FirebaseError(
          `${message}\nSee 'firebase crashlytics:events:list --help' for --filter syntax and examples.`,
          { exit: 1, status, original: getError(err) },
        );
      }
      throw err;
    }

    if (!(await writeOutputFileIfRequested(response, options))) {
      const events = response.events || [];
      if (events.length === 0) {
        logger.info("No matching events found.");
      } else {
        const formatted = events.map((e) => toText(e, { maxFrames, full: Boolean(options.full) }));
        logger.info(dump(formatted, EVENT_DUMP_OPTIONS));
      }
    }
    return response;
  });
