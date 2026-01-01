import * as clc from "colorette";
import * as Table from "cli-table3";

import { Command } from "../command";
import { FirebaseError } from "../error";
import { Options } from "../options";
import { logger } from "../logger";
import { requireAuth } from "../requireAuth";
import { listEvents } from "../crashlytics/events";
import { EventFilter } from "../crashlytics/filters";
import { requireAppId } from "../crashlytics/utils";

interface CommandOptions extends Options {
  app?: string;
  issueId?: string;
  issueVariantId?: string;
  pageSize?: number;
}

export const command = new Command("crashlytics:events:list")
  .description("list recent Crashlytics events for an issue")
  .before(requireAuth)
  .option("--app <appId>", "the app id of your Firebase app")
  .option("--issue-id <issueId>", "filter by issue id")
  .option("--issue-variant-id <variantId>", "filter by issue variant id")
  .option("--page-size <number>", "number of events to return", 1)
  .action(async (options: CommandOptions) => {
    const appId = requireAppId(options.app);
    if (!options.issueId && !options.issueVariantId) {
      throw new FirebaseError("set --issue-id or --issue-variant-id to filter events");
    }

    const filter: EventFilter = {};
    if (options.issueId) {
      filter.issueId = options.issueId;
    }
    if (options.issueVariantId) {
      filter.issueVariantId = options.issueVariantId;
    }

    const pageSize = options.pageSize ?? 1;
    const result = await listEvents(appId, filter, pageSize);

    if (!result.events || result.events.length === 0) {
      logger.info(clc.bold("No events found."));
    } else {
      const table = new Table({
        head: ["Time", "Device", "OS", "Version", "Issue"],
        style: { head: ["green"] },
      });
      for (const event of result.events) {
        table.push([
          event.eventTime ? new Date(event.eventTime).toLocaleString() : "-",
          event.device?.marketingName || event.device?.model || "-",
          event.operatingSystem?.displayName || "-",
          event.version?.displayName || "-",
          event.issue?.title || event.issue?.id || "-",
        ]);
      }
      logger.info(table.toString());
      logger.info(`\n${result.events.length} event(s).`);
    }

    return result;
  });
