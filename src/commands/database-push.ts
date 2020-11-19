import { Command } from "../command";
import * as requireInstance from "../requireInstance";
import { requirePermissions } from "../requirePermissions";
import * as request from "request";
import * as api from "../api";
import * as responseToError from "../responseToError";
import { FirebaseError } from "../error";
import { Emulators } from "../emulator/types";
import { printNoticeIfEmulated } from "../emulator/commandUtils";
import { populateInstanceDetails } from "../management/database";
import { realtimeOriginOrEmulatorOrCustomUrl } from "../database/api";
import * as utils from "../utils";
import * as clc from "cli-color";
import * as logger from "../logger";
import * as fs from "fs";
import * as _ from "lodash";

export default new Command("database:push <path> [infile]")
  .description("add a new JSON object to a list of data in your Firebase")
  .option("-d, --data <data>", "specify escaped JSON directly")
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, use default database instance)"
  )
  .before(requirePermissions, ["firebasedatabase.instances.update"])
  .before(requireInstance)
  .before(populateInstanceDetails)
  .before(printNoticeIfEmulated, Emulators.DATABASE)
  .action((path, infile, options) => {
    if (!_.startsWith(path, "/")) {
      return utils.reject("Path must begin with /", { exit: 1 });
    }
    const inStream =
      utils.stringToStream(options.data) || (infile ? fs.createReadStream(infile) : process.stdin);
    const origin = realtimeOriginOrEmulatorOrCustomUrl(options.instanceDetails.databaseUrl);
    const url = utils.getDatabaseUrl(origin, options.instance, path + ".json");

    if (!infile && !options.data) {
      utils.explainStdin();
    }
    logger.debug("Database URL:" + url);
    const reqOptions = {
      url: url,
      json: true,
    };

    return api.addRequestHeaders(reqOptions).then((reqOptionsWithToken) => {
      return new Promise((resolve, reject) => {
        inStream.pipe(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          request.post(reqOptionsWithToken, (err: Error, res: any, body: any) => {
            logger.info();
            if (err) {
              return reject(
                new FirebaseError("Unexpected error while pushing data", {
                  exit: 2,
                })
              );
            } else if (res.statusCode >= 400) {
              return reject(responseToError(res, body));
            }

            if (!_.endsWith(path, "/")) {
              path += "/";
            }

            const consoleUrl = utils.getDatabaseViewDataUrl(
              origin,
              options.project,
              options.instance,
              path + body.name
            );

            utils.logSuccess("Data pushed successfully");
            logger.info();
            logger.info(clc.bold("View data at:"), consoleUrl);
            return resolve({ key: body.name });
          })
        );
      });
    });
  });
