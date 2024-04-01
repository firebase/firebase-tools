import * as clc from "colorette";
import * as fs from "fs";

import { Client } from "../apiv2";
import { Command } from "../command";
import { Emulators } from "../emulator/types";
import { FirebaseError } from "../error";
import { populateInstanceDetails } from "../management/database";
import { printNoticeIfEmulated } from "../emulator/commandUtils";
import { promptOnce } from "../prompt";
import { realtimeOriginOrEmulatorOrCustomUrl } from "../database/api";
import { requirePermissions } from "../requirePermissions";
import { URL } from "url";
import { logger } from "../logger";
import { requireDatabaseInstance } from "../requireDatabaseInstance";
import * as utils from "../utils";

export const command = new Command("database:set <path> [infile]")
  .description("store JSON data at the specified path via STDIN, arg, or file")
  .option("-d, --data <data>", "specify escaped JSON directly")
  .option("-f, --force", "pass this option to bypass confirmation prompt")
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, use default database instance)",
  )
  .option("--disable-triggers", "suppress any Cloud functions triggered by this operation")
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
    const dbJsonURL = new URL(utils.getDatabaseUrl(origin, options.instance, path + ".json"));
    if (options.disableTriggers) {
      dbJsonURL.searchParams.set("disableTriggers", "true");
    }

    const confirm = await promptOnce(
      {
        type: "confirm",
        name: "force",
        default: false,
        message: "You are about to overwrite all data at " + clc.cyan(dbPath) + ". Are you sure?",
      },
      options,
    );
    if (!confirm) {
      throw new FirebaseError("Command aborted.");
    }

    const inStream =
      utils.stringToStream(options.data) || (infile ? fs.createReadStream(infile) : process.stdin);

    if (!infile && !options.data) {
      utils.explainStdin();
    }

    const c = new Client({ urlPrefix: dbJsonURL.origin, auth: true });
    try {
      await c.request({
        method: "PUT",
        path: dbJsonURL.pathname,
        body: inStream,
        queryParams: dbJsonURL.searchParams,
      });
    } catch (err: any) {
      logger.debug(err);
      throw new FirebaseError(`Unexpected error while setting data: ${err}`, { exit: 2 });
    }

    utils.logSuccess("Data persisted successfully");
    logger.info();
    logger.info(
      clc.bold("View data at:"),
      utils.getDatabaseViewDataUrl(origin, options.project, options.instance, path),
    );
  });
