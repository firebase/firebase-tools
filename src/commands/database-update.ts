import { URL } from "url";
import * as clc from "colorette";
import * as fs from "fs";

import { Command } from "../command";
import { Emulators } from "../emulator/types";
import { FirebaseError } from "../error";
import { populateInstanceDetails } from "../management/database";
import { printNoticeIfEmulated } from "../emulator/commandUtils";
import { promptOnce } from "../prompt";
import { realtimeOriginOrEmulatorOrCustomUrl } from "../database/api";
import { requirePermissions } from "../requirePermissions";
import { logger } from "../logger";
import { requireDatabaseInstance } from "../requireDatabaseInstance";
import * as utils from "../utils";
import DatabaseImporter from "../database/import";

export const command = new Command("database:update <path> [infile]")
  .description("update some of the keys for the defined path in your Firebase")
  .option("-d, --data <data>", "specify escaped JSON directly")
  .option("-f, --force", "pass this option to bypass confirmation prompt")
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, use default database instance)"
  )
  .option("--disable-triggers", "suppress any Cloud functions triggered by this operation")
  .before(requirePermissions, ["firebasedatabase.instances.update"])
  .before(requireDatabaseInstance)
  .before(populateInstanceDetails)
  .before(printNoticeIfEmulated, Emulators.DATABASE)
  .action(async (path: string, infile: string | undefined, options) => {
    if (!path.startsWith("/")) {
      throw new FirebaseError("Path must begin with /");
    }
    const origin = realtimeOriginOrEmulatorOrCustomUrl(options.instanceDetails.databaseUrl);
    const dbPath = utils.getDatabaseUrl(origin, options.instance, path);
    const dbUrl = new URL(dbPath);
    if (options.disableTriggers) {
      dbUrl.searchParams.set("disableTriggers", "true");
    }

    const confirmed = await promptOnce(
      {
        type: "confirm",
        name: "force",
        default: false,
        message: `You are about to modify data at ${clc.cyan(dbPath)}. Are you sure?`,
      },
      options
    );
    if (!confirmed) {
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
      await importer.execute(/* overwrite= */ false);
    } catch (err: any) {
      throw new FirebaseError("Unexpected error while setting data");
    }

    utils.logSuccess("Data updated successfully");
    logger.info();
    logger.info(
      clc.bold("View data at:"),
      utils.getDatabaseViewDataUrl(origin, options.project, options.instance, path)
    );
  });
