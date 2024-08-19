import { URL } from "url";
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
import { logger } from "../logger";
import { requireDatabaseInstance } from "../requireDatabaseInstance";
import * as utils from "../utils";

export const command = new Command("database:update <path> [infile]")
  .description("update some of the keys for the defined path in your Firebase")
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
      options,
    );
    if (!confirmed) {
      throw new FirebaseError("Command aborted.");
    }

    const inStream =
      utils.stringToStream(options.data) ||
      (infile && fs.createReadStream(infile)) ||
      process.stdin;
    const jsonUrl = new URL(utils.getDatabaseUrl(origin, options.instance, path + ".json"));
    if (options.disableTriggers) {
      jsonUrl.searchParams.set("disableTriggers", "true");
    }

    if (!infile && !options.data) {
      utils.explainStdin();
    }

    const c = new Client({ urlPrefix: jsonUrl.origin, auth: true });
    try {
      await c.request({
        method: "PATCH",
        path: jsonUrl.pathname,
        body: inStream,
        queryParams: jsonUrl.searchParams,
      });
    } catch (err: any) {
      throw new FirebaseError("Unexpected error while setting data");
    }

    utils.logSuccess("Data updated successfully");
    logger.info();
    logger.info(
      clc.bold("View data at:"),
      utils.getDatabaseViewDataUrl(origin, options.project, options.instance, path),
    );
  });
