import * as clc from "colorette";
import * as fs from "fs";
import * as utils from "../utils";

import { Command } from "../command";
import DatabaseImporter from "../database/import";
import { Emulators } from "../emulator/types";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { printNoticeIfEmulated } from "../emulator/commandUtils";
import { promptOnce } from "../prompt";
import { populateInstanceDetails } from "../management/database";
import { realtimeOriginOrEmulatorOrCustomUrl } from "../database/api";
import { requireDatabaseInstance } from "../requireDatabaseInstance";
import { requirePermissions } from "../requirePermissions";

export const command = new Command("database:import <path> [infile]")
  .description("non-atomically import JSON data to the specified path via STDIN, arg, or file")
  .option("-d, --data <data>", "specify escaped JSON directly")
  .option("-f, --force", "pass this option to bypass confirmation prompt")
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, use default database instance)"
  )
  .option(
    "--disable-triggers",
    "suppress any Cloud functions triggered by this operation, default to true",
    true
  )
  .before(requirePermissions, ["firebasedatabase.instances.update"])
  .before(requireDatabaseInstance)
  .before(populateInstanceDetails)
  .before(printNoticeIfEmulated, Emulators.DATABASE)
  .action(async (path: string, infile, options) => {
    if (!path.startsWith("/")) {
      throw new FirebaseError("Path must begin with /");
    }
    const origin = realtimeOriginOrEmulatorOrCustomUrl(options.instanceDetails.databaseUrl);
    const dbPath = utils.getDatabaseUrl(origin, options.instance, path);
    const dbUrl = new URL(dbPath);
    if (options.disableTriggers) {
      dbUrl.searchParams.set("disableTriggers", "true");
    }

    const confirm = await promptOnce(
      {
        type: "confirm",
        name: "force",
        default: false,
        message: "You are about to import data to " + clc.cyan(dbPath) + ". Are you sure?",
      },
      options
    );
    if (!confirm) {
      throw new FirebaseError("Command aborted.");
    }

    const inputString =
      options.data ||
      (await utils.streamToString(infile ? fs.createReadStream(infile) : process.stdin));

    if (!infile && !options.data) {
      utils.explainStdin();
    }

    const importer = new DatabaseImporter(dbUrl, inputString);
    try {
      await importer.execute();
    } catch (err: any) {
      if (err instanceof FirebaseError) {
        throw err;
      }
      logger.debug(err);
      throw new FirebaseError(`Unexpected error while importing data: ${err}`, { exit: 2 });
    }

    utils.logSuccess("Data persisted successfully");
    logger.info();
    logger.info(
      clc.bold("View data at:"),
      utils.getDatabaseViewDataUrl(origin, options.project, options.instance, path)
    );
  });
