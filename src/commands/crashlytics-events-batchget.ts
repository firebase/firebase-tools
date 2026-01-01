import * as clc from "colorette";
import * as Table from "cli-table3";

import { Command } from "../command";
import { FirebaseError } from "../error";
import { Options } from "../options";
import { logger } from "../logger";
import { requireAuth } from "../requireAuth";
import { batchGetEvents } from "../crashlytics/events";

interface CommandOptions extends Options {
  app?: string;
}

export const command = new Command("crashlytics:events:batchget <eventNames...>")
  .description("get specific Crashlytics events by resource name")
  .before(requireAuth)
  .option("--app <appId>", "the app id of your Firebase app")
  .action(async (eventNames: string[], options: CommandOptions) => {
    if (!options.app) {
      throw new FirebaseError(
        "set --app <appId> to a valid Firebase application id, e.g. 1:00000000:android:0000000",
      );
    }
    if (!eventNames || eventNames.length === 0) {
      throw new FirebaseError("provide at least one event resource name");
    }

    const result = await batchGetEvents(options.app, eventNames);

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
