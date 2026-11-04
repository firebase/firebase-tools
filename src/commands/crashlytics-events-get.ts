import { dump } from "js-yaml";

import { Command } from "../command";
import {
  CrashlyticsCommandOptions,
  parsePositiveIntOption,
  requireAppId,
  writeOutputFileIfRequested,
} from "../crashlytics/commandUtils";
import {
  batchGetEvents,
  DEFAULT_MAX_FRAMES,
  EVENT_DUMP_OPTIONS,
  normalizeEventResourceName,
  toText,
} from "../crashlytics/events";
import { BatchGetEventsResponse } from "../crashlytics/types";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { requireAuth } from "../requireAuth";

export interface EventsGetOptions extends CrashlyticsCommandOptions {
  maxFrames?: string | number;
  full?: boolean;
}

export const command = new Command("crashlytics:events:get <eventIds...>")
  .description("get one or more Crashlytics events by event ID or resource name")
  .option("--app <appId>", "the Firebase App ID")
  .option(
    "--max-frames <number>",
    `maximum stack frames per thread or exception (default: ${DEFAULT_MAX_FRAMES}, ignored when --full is set)`,
  )
  .option("--full", "include all threads, stack frames, logs, and breadcrumbs without truncation")
  .option("-o, --output <path>", "write raw JSON output to a file")
  .withForce("overwrite output file without prompting")
  .before(requireAuth)
  .action(
    async (eventIds: string[], options: EventsGetOptions): Promise<BatchGetEventsResponse> => {
      const appId = requireAppId(options);
      const rawIds = Array.isArray(eventIds)
        ? eventIds.map((id) => String(id).trim()).filter(Boolean)
        : [];
      if (rawIds.length === 0) {
        throw new FirebaseError("Must specify at least one '<eventId>'.", { exit: 1 });
      }
      if (rawIds.length > 100) {
        throw new FirebaseError("Cannot request more than 100 events in a single call.", {
          exit: 1,
        });
      }

      const maxFrames = parsePositiveIntOption(options.maxFrames, "--max-frames", {
        defaultValue: DEFAULT_MAX_FRAMES,
      });
      const resourceNames = rawIds.map((id) => normalizeEventResourceName(appId, id));

      const response = await batchGetEvents(appId, resourceNames);
      if (!(await writeOutputFileIfRequested(response, options))) {
        const events = response.events || [];
        if (events.length === 0) {
          logger.info("No matching events found.");
        } else {
          const formatted = events.map((e) =>
            toText(e, { maxFrames, full: Boolean(options.full) }),
          );
          logger.info(dump(formatted, EVENT_DUMP_OPTIONS));
        }
      }
      return response;
    },
  );
