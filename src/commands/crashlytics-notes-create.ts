import { Command } from "../command";
import { FirebaseError } from "../error";
import { Options } from "../options";
import * as utils from "../utils";
import { requireAuth } from "../requireAuth";
import { createNote } from "../crashlytics/notes";
import { requireAppId } from "../crashlytics/utils";

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
    const appId = requireAppId(options.app);
    if (!options.note) {
      throw new FirebaseError("set --note <text> to specify the note content");
    }

    const note = await createNote(appId, issueId, options.note);

    utils.logLabeledSuccess("crashlytics", `Created note on issue ${issueId}`);

    return note;
  });
