import { Response } from "request";
import * as _ from "lodash";
import * as request from "request";

import * as responseToError from "../responseToError";
import { Command } from "../command";
import * as logger from "../logger";
import { FirebaseError } from "../error";
import { requirePermissions } from "../requirePermissions";
import * as utils from "../utils";
import * as api from "../api";
import * as requireInstance from "../requireInstance";
import {
  DATABASE_SETTINGS,
  DatabaseSetting,
  HELP_TEXT,
  INVALID_PATH_ERROR,
} from "../database/settings";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";

export default new Command("database:settings:set <path> <value>")
  .description("set the realtime database setting at path.")
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, use default database instance)"
  )
  .help(HELP_TEXT)
  .before(requirePermissions, ["firebasedatabase.instances.update"])
  .before(requireInstance)
  .before(warnEmulatorNotSupported, Emulators.DATABASE)
  .action((path: string, value: string, options: any) => {
    const setting = DATABASE_SETTINGS.get(path);
    if (setting === undefined) {
      return utils.reject(INVALID_PATH_ERROR, { exit: 1 });
    }
    const parsedValue = setting.parseInput(value);
    if (parsedValue === undefined) {
      return utils.reject(setting.parseInputErrorMessge, { exit: 1 });
    }
    return new Promise((resolve, reject) => {
      const url =
        utils.addSubdomain(api.realtimeOrigin, options.instance) + "/.settings/" + path + ".json";
      const reqOptions = {
        url,
        body: parsedValue,
        json: true,
      };
      return api.addRequestHeaders(reqOptions).then((reqOptionsWithToken) => {
        request.put(reqOptionsWithToken, (err: Error, res: Response, body: any) => {
          if (err) {
            return reject(
              new FirebaseError(`Unexpected error fetching configs at ${path}`, {
                exit: 2,
                original: err,
              })
            );
          } else if (res.statusCode >= 400) {
            return reject(responseToError(res, body));
          }
          utils.logSuccess("Successfully set setting.");
          utils.logSuccess(
            `For database instance ${options.instance}\n\t ${path} = ${JSON.stringify(parsedValue)}`
          );
          resolve();
        });
      });
    });
  });
