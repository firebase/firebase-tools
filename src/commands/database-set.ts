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
import * as utils from "../utils";
import { realtimeOriginOrEmulatorOrCustomUrl } from "../database/api";
import * as clc from "cli-color";
import * as logger from "../logger";
import * as fs from "fs";
import { prompt } from "../prompt";
import * as _ from "lodash";

export default new Command("database:set <path> [infile]")
  .description("store JSON data at the specified path via STDIN, arg, or file")
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
  .action((path, infile, options) => {
    if (!_.startsWith(path, "/")) {
      return utils.reject("Path must begin with /", { exit: 1 });
    }
    const origin = realtimeOriginOrEmulatorOrCustomUrl(options.instanceDetails.databaseUrl);
    const dbPath = utils.getDatabaseUrl(origin, options.instance, path);
    const dbJsonPath = utils.getDatabaseUrl(origin, options.instance, path + ".json");

    return prompt(options, [
      {
        type: "confirm",
        name: "confirm",
        default: false,
        message: "You are about to overwrite all data at " + clc.cyan(dbPath) + ". Are you sure?",
      },
    ]).then(() => {
      if (!options.confirm) {
        return utils.reject("Command aborted.", { exit: 1 });
      }

      const inStream =
        utils.stringToStream(options.data) ||
        (infile ? fs.createReadStream(infile) : process.stdin);

      if (!infile && !options.data) {
        utils.explainStdin();
      }

      const reqOptions = {
        url: dbJsonPath,
        json: true,
      };

      return api.addRequestHeaders(reqOptions).then((reqOptionsWithToken) => {
        return new Promise((resolve, reject) => {
          inStream.pipe(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            request.put(reqOptionsWithToken, (err: Error, res: any, body: any) => {
              logger.info();
              if (err) {
                logger.debug(err);
                return reject(
                  new FirebaseError("Unexpected error while setting data", {
                    exit: 2,
                  })
                );
              } else if (res.statusCode >= 400) {
                return reject(responseToError(res, body));
              }

              utils.logSuccess("Data persisted successfully");
              logger.info();
              logger.info(
                clc.bold("View data at:"),
                utils.getDatabaseViewDataUrl(origin, options.project, options.instance, path)
              );
              return resolve();
            })
          );
        });
      });
    });
  });
