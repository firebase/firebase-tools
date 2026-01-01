import * as clc from "colorette";
import * as Table from "cli-table3";

import { Command } from "../command";
import { Options } from "../options";
import { logger } from "../logger";
import { requireAuth } from "../requireAuth";
import { listNotes } from "../crashlytics/notes";
import { requireAppId } from "../crashlytics/utils";

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
    const appId = requireAppId(options.app);

    const pageSize = options.pageSize ?? 20;
    const notes = await listNotes(appId, issueId, pageSize);

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
