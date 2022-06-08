import { URL } from "url";

import { Client } from "../apiv2.js";
import { Command } from "../command.js";
import { DATABASE_SETTINGS, HELP_TEXT, INVALID_PATH_ERROR } from "../database/settings.js";
import { Emulators } from "../emulator/types.js";
import { FirebaseError } from "../error.js";
import { populateInstanceDetails } from "../management/database.js";
import { realtimeOriginOrCustomUrl } from "../database/api.js";
import { requirePermissions } from "../requirePermissions.js";
import { warnEmulatorNotSupported } from "../emulator/commandUtils.js";
import { requireDatabaseInstance } from "../requireDatabaseInstance.js";
import * as utils from "../utils.js";

export const command = new Command("database:settings:set <path> <value>")
  .description("set the realtime database setting at path.")
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, use default database instance)"
  )
  .help(HELP_TEXT)
  .before(requirePermissions, ["firebasedatabase.instances.update"])
  .before(requireDatabaseInstance)
  .before(populateInstanceDetails)
  .before(warnEmulatorNotSupported, Emulators.DATABASE)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .action(async (path: string, value: string, options: any) => {
    const setting = DATABASE_SETTINGS.get(path);
    if (setting === undefined) {
      return utils.reject(INVALID_PATH_ERROR, { exit: 1 });
    }
    const parsedValue = setting.parseInput(value);
    if (parsedValue === undefined) {
      return utils.reject(setting.parseInputErrorMessge, { exit: 1 });
    }

    const u = new URL(
      utils.getDatabaseUrl(
        realtimeOriginOrCustomUrl(options.instanceDetails.databaseUrl),
        options.instance,
        `/.settings/${path}.json`
      )
    );
    const c = new Client({ urlPrefix: u.origin, auth: true });
    try {
      await c.put(u.pathname, JSON.stringify(parsedValue));
    } catch (err: any) {
      throw new FirebaseError(`Unexpected error fetching configs at ${path}`, {
        exit: 2,
        original: err,
      });
    }
    utils.logSuccess("Successfully set setting.");
    utils.logSuccess(
      `For database instance ${options.instance}\n\t ${path} = ${JSON.stringify(parsedValue)}`
    );
  });
