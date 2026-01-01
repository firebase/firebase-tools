import { Command } from "../command";
import { FirebaseError } from "../error";
import { Options } from "../options";
import * as utils from "../utils";
import { requireAuth } from "../requireAuth";
import { deleteNote } from "../crashlytics/notes";

interface CommandOptions extends Options {
  app?: string;
}

export const command = new Command("crashlytics:notes:delete <issueId> <noteId>")
  .description("delete a note from a Crashlytics issue")
  .before(requireAuth)
  .option("--app <appId>", "the app id of your Firebase app")
  .action(async (issueId: string, noteId: string, options: CommandOptions) => {
    if (!options.app) {
      throw new FirebaseError(
        "set --app <appId> to a valid Firebase application id, e.g. 1:00000000:android:0000000",
      );
    }

    await deleteNote(options.app, issueId, noteId);
    utils.logLabeledSuccess("crashlytics", `Deleted note ${noteId} from issue ${issueId}`);
  });
