import { URL } from "url";

import { Client } from "../apiv2";
import { Command } from "../command";
import { DATABASE_SETTINGS, HELP_TEXT, INVALID_PATH_ERROR } from "../database/settings";
import { Emulators } from "../emulator/types";
import { FirebaseError } from "../error";
import { populateInstanceDetails } from "../management/database";
import { realtimeOriginOrCustomUrl } from "../database/api";
import { requirePermissions } from "../requirePermissions";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { requireDatabaseInstance } from "../requireDatabaseInstance";
import * as utils from "../utils";

export const command = new Command("database:settings:set <path> <value>")
  .description("set the realtime database setting at path.")
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, use default database instance)",
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
        `/.settings/${path}.json`,
      ),
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
      `For database instance ${options.instance}\n\t ${path} = ${JSON.stringify(parsedValue)}`,
    );
  });
