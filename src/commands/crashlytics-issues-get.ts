import * as Table from "cli-table3";

import { Command } from "../command";
import {
  CrashlyticsCommandOptions,
  requireAppId,
  writeOutputFileIfRequested,
} from "../crashlytics/commandUtils";
import { getIssue } from "../crashlytics/issues";
import { Issue } from "../crashlytics/types";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { requireAuth } from "../requireAuth";

function logIssue(issue: Issue): void {
  const table = new Table({
    head: ["Field", "Value"],
    style: { head: ["green"] },
  });

  const rows: Array<[string, string | undefined]> = [
    ["Issue ID", issue.id],
    ["Title", issue.title],
    ["Subtitle", issue.subtitle],
    ["State", issue.state],
    ["Error Type", issue.errorType],
    ["First Seen Version", issue.firstSeenVersion],
    ["Last Seen Version", issue.lastSeenVersion],
    ["First Seen Time", issue.firstSeenTime],
    ["Last Seen Time", issue.lastSeenTime],
    [
      "Signals",
      issue.signals
        ?.map((s) => s.signal)
        .filter(Boolean)
        .join(", "),
    ],
    ["Notes Count", issue.notesCount !== undefined ? String(issue.notesCount) : undefined],
    ["Sample Event", issue.sampleEvent],
    ["Console URI", issue.uri],
  ];

  for (const [label, value] of rows) {
    if (value !== undefined && value !== "") {
      table.push([label, value]);
    }
  }

  logger.info(table.toString());
}

export const command = new Command("crashlytics:issues:get <issueId>")
  .description("get details for a Crashlytics issue")
  .option("--app <appId>", "the Firebase App ID")
  .option("-o, --output <path>", "write raw JSON output to a file")
  .withForce("overwrite output file without prompting")
  .before(requireAuth)
  .action(async (issueId: string, options: CrashlyticsCommandOptions): Promise<Issue> => {
    const appId = requireAppId(options);
    const trimmedIssueId = typeof issueId === "string" ? issueId.trim() : "";
    if (!trimmedIssueId) {
      throw new FirebaseError("Must specify '<issueId>'.", { exit: 1 });
    }

    const issue = await getIssue(appId, trimmedIssueId);
    if (!(await writeOutputFileIfRequested(issue, options))) {
      logIssue(issue);
    }
    return issue;
  });
