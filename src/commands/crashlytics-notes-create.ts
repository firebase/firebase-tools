import { Command } from "../command";
import { FirebaseError } from "../error";
import { Options } from "../options";
import * as utils from "../utils";
import { requireAuth } from "../requireAuth";
import { createNote } from "../crashlytics/notes";

interface CommandOptions extends Options {
  app?: string;
  note?: string;
}

export const command = new Command("crashlytics:notes:create <issueId>")
  .description("add a note to a Crashlytics issue")
  .before(requireAuth)
  .option("--app <appId>", "the app id of your Firebase app")
  .option("--note <text>", "the note text to add to the issue")
  .action(async (issueId: string, options: CommandOptions) => {
    if (!options.app) {
      throw new FirebaseError(
        "set --app <appId> to a valid Firebase application id, e.g. 1:00000000:android:0000000",
      );
    }
    if (!options.note) {
      throw new FirebaseError("set --note <text> to specify the note content");
    }

    const note = await createNote(options.app, issueId, options.note);

    utils.logLabeledSuccess("crashlytics", `Created note on issue ${issueId}`);

    return note;
  });
