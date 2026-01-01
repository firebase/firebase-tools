import * as clc from "colorette";
import * as Table from "cli-table3";

import { Command } from "../command";
import { FirebaseError } from "../error";
import { Options } from "../options";
import { logger } from "../logger";
import { requireAuth } from "../requireAuth";
import { listNotes } from "../crashlytics/notes";

interface CommandOptions extends Options {
  app?: string;
  pageSize?: number;
}

export const command = new Command("crashlytics:notes:list <issueId>")
  .description("list notes for a Crashlytics issue")
  .before(requireAuth)
  .option("--app <appId>", "the app id of your Firebase app")
  .option("--page-size <number>", "number of notes to return", 20)
  .action(async (issueId: string, options: CommandOptions) => {
    if (!options.app) {
      throw new FirebaseError(
        "set --app <appId> to a valid Firebase application id, e.g. 1:00000000:android:0000000",
      );
    }

    const pageSize = options.pageSize ?? 20;
    const notes = await listNotes(options.app, issueId, pageSize);

    if (notes.length === 0) {
      logger.info(clc.bold("No notes found."));
    } else {
      const table = new Table({
        head: ["Author", "Created", "Note"],
        style: { head: ["green"] },
        colWidths: [30, 25, 50],
        wordWrap: true,
      });
      for (const note of notes) {
        table.push([
          note.author || "-",
          note.createTime ? new Date(note.createTime).toLocaleString() : "-",
          note.body || "-",
        ]);
      }
      logger.info(table.toString());
      logger.info(`\n${notes.length} note(s).`);
    }

    return notes;
  });
