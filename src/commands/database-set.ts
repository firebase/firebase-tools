import * as _ from "lodash";
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
import { URL } from "url";
import * as logger from "../logger";
import { requireDatabaseInstance } from "../requireDatabaseInstance";
import * as utils from "../utils";

export default new Command("database:set <path> [infile]")
  .description("store JSON data at the specified path via STDIN, arg, or file")
  .option("-d, --data <data>", "specify escaped JSON directly")
  .option("-y, --confirm", "pass this option to bypass confirmation prompt")
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, use default database instance)"
  )
  .before(requirePermissions, ["firebasedatabase.instances.update"])
  .before(requireDatabaseInstance)
  .before(populateInstanceDetails)
  .before(printNoticeIfEmulated, Emulators.DATABASE)
  .action(async (path, infile, options) => {
    if (!_.startsWith(path, "/")) {
      throw new FirebaseError("Path must begin with /");
    }
    const origin = realtimeOriginOrEmulatorOrCustomUrl(options.instanceDetails.databaseUrl);
    const dbPath = utils.getDatabaseUrl(origin, options.instance, path);
    const dbJsonURL = new URL(utils.getDatabaseUrl(origin, options.instance, path + ".json"));

    if (!options.confirm) {
      const confirm = await promptOnce({
        type: "confirm",
        name: "confirm",
        default: false,
        message: "You are about to overwrite all data at " + clc.cyan(dbPath) + ". Are you sure?",
      });
      if (!confirm) {
        throw new FirebaseError("Command aborted.");
      }
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
      });
    } catch (err) {
      logger.debug(err);
      throw new FirebaseError(`Unexpected error while setting data: ${err}`, { exit: 2 });
    }

    utils.logSuccess("Data persisted successfully");
    logger.info();
    logger.info(
      clc.bold("View data at:"),
      utils.getDatabaseViewDataUrl(origin, options.project, options.instance, path)
    );
  });
