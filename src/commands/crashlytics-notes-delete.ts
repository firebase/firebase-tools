import { Command } from "../command";
import { Options } from "../options";
import * as utils from "../utils";
import { requireAuth } from "../requireAuth";
import { deleteNote } from "../crashlytics/notes";
import { requireAppId } from "../crashlytics/utils";

interface CommandOptions extends Options {
  app?: string;
}

export const command = new Command("crashlytics:notes:delete <issueId> <noteId>")
  .description("delete a note from a Crashlytics issue")
  .before(requireAuth)
  .option("--app <appId>", "the app id of your Firebase app")
  .action(async (issueId: string, noteId: string, options: CommandOptions) => {
    const appId = requireAppId(options.app);

    await deleteNote(appId, issueId, noteId);
    utils.logLabeledSuccess("crashlytics", `Deleted note ${noteId} from issue ${issueId}`);
  });
