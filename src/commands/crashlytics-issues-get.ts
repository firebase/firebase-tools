import * as Table from "cli-table3";

import { Command } from "../command";
import { FirebaseError } from "../error";
import { Options } from "../options";
import { logger } from "../logger";
import { requireAuth } from "../requireAuth";
import { getIssue } from "../crashlytics/issues";

interface CommandOptions extends Options {
  app?: string;
}

export const command = new Command("crashlytics:issues:get <issueId>")
  .description("get details for a Crashlytics issue")
  .before(requireAuth)
  .option("--app <appId>", "the app id of your Firebase app")
  .action(async (issueId: string, options: CommandOptions) => {
    if (!options.app) {
      throw new FirebaseError(
        "set --app <appId> to a valid Firebase application id, e.g. 1:00000000:android:0000000",
      );
    }

    const issue = await getIssue(options.app, issueId);

    // Display formatted output
    const table = new Table();
    table.push(
      { ID: issue.id || "-" },
      { Title: issue.title || "-" },
      { Subtitle: issue.subtitle || "-" },
      { Type: issue.errorType || "-" },
      { State: issue.state || "-" },
      { "First Seen": issue.firstSeenVersion || "-" },
      { "Last Seen": issue.lastSeenVersion || "-" },
      { Variants: issue.variants?.length?.toString() || "0" },
    );
    logger.info(table.toString());

    if (issue.uri) {
      logger.info(`\nConsole: ${issue.uri}`);
    }

    return issue;
  });
