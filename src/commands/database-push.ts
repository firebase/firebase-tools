import * as _ from "lodash";
import * as clc from "cli-color";
import * as fs from "fs";

import { Client } from "../apiv2.js";
import { Command } from "../command.js";
import { Emulators } from "../emulator/types.js";
import { FirebaseError } from "../error.js";
import { populateInstanceDetails } from "../management/database.js";
import { printNoticeIfEmulated } from "../emulator/commandUtils.js";
import { realtimeOriginOrEmulatorOrCustomUrl } from "../database/api.js";
import { requirePermissions } from "../requirePermissions.js";
import { URL } from "url";
import { logger } from "../logger.js";
import { requireDatabaseInstance } from "../requireDatabaseInstance.js";
import * as utils from "../utils.js";

export const command = new Command("database:push <path> [infile]")
  .description("add a new JSON object to a list of data in your Firebase")
  .option("-d, --data <data>", "specify escaped JSON directly")
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
    const inStream =
      utils.stringToStream(options.data) || (infile ? fs.createReadStream(infile) : process.stdin);
    const origin = realtimeOriginOrEmulatorOrCustomUrl(options.instanceDetails.databaseUrl);
    const u = new URL(utils.getDatabaseUrl(origin, options.instance, path + ".json"));

    if (!infile && !options.data) {
      utils.explainStdin();
    }
    logger.debug(`Database URL: ${u}`);

    const c = new Client({ urlPrefix: u.origin, auth: true });
    let res;
    try {
      res = await c.request<NodeJS.ReadableStream, { name: string }>({
        method: "POST",
        path: u.pathname,
        body: inStream,
      });
    } catch (err: any) {
      logger.debug(err);
      throw new FirebaseError(`Unexpected error while pushing data: ${err}`, { exit: 2 });
    }

    if (!_.endsWith(path, "/")) {
      path += "/";
    }

    const consoleUrl = utils.getDatabaseViewDataUrl(
      origin,
      options.project,
      options.instance,
      path + res.body.name
    );

    utils.logSuccess("Data pushed successfully");
    logger.info();
    logger.info(clc.bold("View data at:"), consoleUrl);
    return { key: res.body.name };
  });
