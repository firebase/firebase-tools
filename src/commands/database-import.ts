import * as clc from "colorette";
import * as fs from "fs";
import * as utils from "../utils";

import { Command } from "../command";
import DatabaseImporter from "../database/import";
import { Emulators } from "../emulator/types";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { needProjectId } from "../projectUtils";
import { Options } from "../options";
import { printNoticeIfEmulated } from "../emulator/commandUtils";
import { promptOnce } from "../prompt";
import { DatabaseInstance, populateInstanceDetails } from "../management/database";
import { realtimeOriginOrEmulatorOrCustomUrl } from "../database/api";
import { requireDatabaseInstance } from "../requireDatabaseInstance";
import { requirePermissions } from "../requirePermissions";

interface DatabaseImportOptions extends Options {
  instance: string;
  instanceDetails: DatabaseInstance;
  disableTriggers?: boolean;
  filter?: string;
}

export const command = new Command("database:import <path> [infile]")
  .description(
    "non-atomically import the contents of a JSON file to the specified path in Realtime Database"
  )
  .withForce()
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, use default database instance)"
  )
  .option(
    "--disable-triggers",
    "suppress any Cloud functions triggered by this operation, default to true",
    true
  )
  .option(
    "--filter <dataPath>",
    "import only data at this path in the JSON file (if omitted, import entire file)"
  )
  .before(requirePermissions, ["firebasedatabase.instances.update"])
  .before(requireDatabaseInstance)
  .before(populateInstanceDetails)
  .before(printNoticeIfEmulated, Emulators.DATABASE)
  .action(async (path: string, infile: string | undefined, options: DatabaseImportOptions) => {
    if (!path.startsWith("/")) {
      throw new FirebaseError("Path must begin with /");
    }

    if (!infile) {
      throw new FirebaseError("No file supplied");
    }

    const projectId = needProjectId(options);
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

    const inStream = fs.createReadStream(infile);
    const dataPath = options.filter || "";
    const importer = new DatabaseImporter(dbUrl, inStream, dataPath);

    let responses;
    try {
      responses = await importer.execute();
    } catch (err: any) {
      if (err instanceof FirebaseError) {
        throw err;
      }
      logger.debug(err);
      throw new FirebaseError(`Unexpected error while importing data: ${err}`, { exit: 2 });
    }

    if (responses.length) {
      utils.logSuccess("Data persisted successfully");
    } else {
      utils.logWarning("No data was persisted. Check the data path supplied.");
    }

    logger.info();
    logger.info(
      clc.bold("View data at:"),
      utils.getDatabaseViewDataUrl(origin, projectId, options.instance, path)
    );
  });
