import { URL } from "url";
import * as clc from "cli-color";
import * as fs from "fs";

import { Client } from "../apiv2.js";
import { Command } from "../command.js";
import { Emulators } from "../emulator/types.js";
import { FirebaseError } from "../error.js";
import { populateInstanceDetails } from "../management/database.js";
import { printNoticeIfEmulated } from "../emulator/commandUtils.js";
import { promptOnce } from "../prompt.js";
import { realtimeOriginOrEmulatorOrCustomUrl } from "../database/api.js";
import { requirePermissions } from "../requirePermissions.js";
import { logger } from "../logger.js";
import { requireDatabaseInstance } from "../requireDatabaseInstance.js";
import * as utils from "../utils.js";

export const command = new Command("database:update <path> [infile]")
  .description("update some of the keys for the defined path in your Firebase")
  .option("-d, --data <data>", "specify escaped JSON directly")
  .option("-f, --force", "pass this option to bypass confirmation prompt")
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, use default database instance)"
  )
  .before(requirePermissions, ["firebasedatabase.instances.update"])
  .before(requireDatabaseInstance)
  .before(populateInstanceDetails)
  .before(printNoticeIfEmulated, Emulators.DATABASE)
  .action(async (path: string, infile: string | undefined, options) => {
    if (!path.startsWith("/")) {
      throw new FirebaseError("Path must begin with /");
    }
    const origin = realtimeOriginOrEmulatorOrCustomUrl(options.instanceDetails.databaseUrl);
    const url = utils.getDatabaseUrl(origin, options.instance, path);
    const confirmed = await promptOnce(
      {
        type: "confirm",
        name: "force",
        default: false,
        message: `You are about to modify data at ${clc.cyan(url)}. Are you sure?`,
      },
      options
    );
    if (!confirmed) {
      throw new FirebaseError("Command aborted.");
    }

    const inStream =
      utils.stringToStream(options.data) ||
      (infile && fs.createReadStream(infile)) ||
      process.stdin;
    const jsonUrl = new URL(utils.getDatabaseUrl(origin, options.instance, path + ".json"));

    if (!infile && !options.data) {
      utils.explainStdin();
    }

    const c = new Client({ urlPrefix: jsonUrl.origin, auth: true });
    try {
      await c.request({
        method: "PATCH",
        path: jsonUrl.pathname,
        body: inStream,
      });
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
