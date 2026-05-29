import * as Table from "cli-table3";

import { Command } from "../command";
import { Options } from "../options";
import { logger } from "../logger";
import { requireAuth } from "../requireAuth";
import { getIssue } from "../crashlytics/issues";
import { requireAppId } from "../crashlytics/utils";

interface CommandOptions extends Options {
  app?: string;
}

export const command = new Command("crashlytics:issues:get <issueId>")
  .description("get details for a Crashlytics issue")
  .before(requireAuth)
  .option("--app <appId>", "the app id of your Firebase app")
  .action(async (issueId: string, options: CommandOptions) => {
    const appId = requireAppId(options.app);

    const issue = await getIssue(appId, issueId);

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
