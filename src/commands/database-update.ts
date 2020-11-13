import { URL } from "url";
import * as clc from "cli-color";
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
import * as logger from "../logger";
import * as requireInstance from "../requireInstance";
import * as utils from "../utils";

export default new Command("database:update <path> [infile]")
  .description("update some of the keys for the defined path in your Firebase")
  .option("-d, --data <data>", "specify escaped JSON directly")
  .option("-y, --confirm", "pass this option to bypass confirmation prompt")
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, use default database instance)"
  )
  .before(requirePermissions, ["firebasedatabase.instances.update"])
  .before(requireInstance)
  .before(populateInstanceDetails)
  .before(printNoticeIfEmulated, Emulators.DATABASE)
  .action(async (path: string, infile: string | undefined, options) => {
    if (!path.startsWith("/")) {
      throw new FirebaseError("Path must begin with /");
    }
    const origin = realtimeOriginOrEmulatorOrCustomUrl(options.instanceDetails.databaseUrl);
    const url = utils.getDatabaseUrl(origin, options.instance, path);
    if (!options.confirm) {
      const confirmed = await promptOnce({
        type: "confirm",
        name: "confirm",
        default: false,
        message: `You are about to modify data at ${clc.cyan(url)}. Are you sure?`,
      });
      if (!confirmed) {
        throw new FirebaseError("Command aborted.");
      }
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
    } catch (err) {
      throw new FirebaseError("Unexpected error while setting data");
    }

    utils.logSuccess("Data updated successfully");
    logger.info();
    logger.info(
      clc.bold("View data at:"),
      utils.getDatabaseViewDataUrl(origin, options.project, options.instance, path)
    );
  });
