import { Command } from "../command";
import { FirebaseError } from "../error";
import { Options } from "../options";
import * as utils from "../utils";
import { requireAuth } from "../requireAuth";
import { updateIssue } from "../crashlytics/issues";
import { State } from "../crashlytics/types";
import { requireAppId } from "../crashlytics/utils";

interface CommandOptions extends Options {
  app?: string;
  state?: string;
}

export const command = new Command("crashlytics:issues:update <issueId>")
  .description("update the state of a Crashlytics issue")
  .before(requireAuth)
  .option("--app <appId>", "the app id of your Firebase app")
  .option("--state <state>", "the new state for the issue (OPEN or CLOSED)")
  .action(async (issueId: string, options: CommandOptions) => {
    const appId = requireAppId(options.app);
    if (!options.state) {
      throw new FirebaseError("set --state to OPEN or CLOSED");
    }

    const stateUpper = options.state.toUpperCase();
    if (stateUpper !== "OPEN" && stateUpper !== "CLOSED") {
      throw new FirebaseError("--state must be OPEN or CLOSED");
    }

    const state = stateUpper as State;
    const issue = await updateIssue(appId, issueId, state);

    utils.logLabeledSuccess("crashlytics", `Issue ${issueId} is now ${String(issue.state)}`);

    return issue;
  });
