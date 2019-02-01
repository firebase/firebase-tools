import { Response } from "request";
import * as _ from "lodash";
import * as request from "request";

import * as responseToError from "../responseToError";
import * as Command from "../command";
import * as logger from "../logger";
import * as FirebaseError from "../error";
import * as requirePermissions from "../requirePermissions";
import * as utils from "../utils";
import * as api from "../api";
import * as requireInstance from "../requireInstance";
import { DatabaseSetting, DATABASE_SETTINGS } from "../database/settings";

export default new Command("database:settings:get <path>")
  .description(
    "fetch realtime database setting. The available settings are:\n" +
    Array.from(DATABASE_SETTINGS.values())
    .map((setting: DatabaseSetting) => `${setting.path}${setting.description}`)
    .join("")
  )
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, use default database instance)"
  )
  .before(requirePermissions, ["firebasedatabase.instances.get"])
  .before(requireInstance)
  .action(function(path: string, options: any) {
    if (!DATABASE_SETTINGS.has(path)) {
      return utils.reject(`Path must be one of ${Array.from(DATABASE_SETTINGS.keys()).join(", ")}.`, {
        exit: 1,
      });
    }
    return new Promise((resolve, reject) => {
      const url =
        utils.addSubdomain(api.realtimeOrigin, options.instance) + "/.settings/" + path + ".json";
      const reqOptions = {
        url,
      };
      return api.addRequestHeaders(reqOptions).then((reqOptionsWithToken) => {
        request.get(reqOptionsWithToken, (err: Error, res: Response, body: any) => {
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
          utils.logSuccess(
            `For database instance ${options.instance}\n\t ${path} = ${body}`
          );
          resolve();
        });
      });
    });
  });
