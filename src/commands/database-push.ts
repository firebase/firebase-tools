import * as _ from "lodash";
import * as clc from "cli-color";
import * as fs from "fs";

import { Client } from "../apiv2";
import { Command } from "../command";
import { Emulators } from "../emulator/types";
import { FirebaseError } from "../error";
import { populateInstanceDetails } from "../management/database";
import { printNoticeIfEmulated } from "../emulator/commandUtils";
import { realtimeOriginOrEmulatorOrCustomUrl } from "../database/api";
import { requirePermissions } from "../requirePermissions";
import { URL } from "url";
import * as logger from "../logger";
import { requireDatabaseInstance } from "../requireDatabaseInstance";
import * as utils from "../utils";

export default new Command("database:push <path> [infile]")
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
    } catch (err) {
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
