import { Command } from "../command";
import { requireDatabaseInstance } from "../requireDatabaseInstance";
import { requirePermissions } from "../requirePermissions";
import DatabaseRemove from "../database/remove";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { populateInstanceDetails } from "../management/database";
import { realtimeOriginOrEmulatorOrCustomUrl } from "../database/api";
import * as utils from "../utils";
import { promptOnce } from "../prompt";
import * as clc from "cli-color";
import * as _ from "lodash";

module.exports = new Command("database:remove <path>")
  .description("remove data from your Firebase at the specified path")
  .option("-f, --force", "pass this option to bypass confirmation prompt")
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, use default database instance)"
  )
  .before(requirePermissions, ["firebasedatabase.instances.update"])
  .before(requireDatabaseInstance)
  .before(populateInstanceDetails)
  .before(warnEmulatorNotSupported, Emulators.DATABASE)
  .action(async (path, options) => {
    if (!_.startsWith(path, "/")) {
      return utils.reject("Path must begin with /", { exit: 1 });
    }
    const origin = realtimeOriginOrEmulatorOrCustomUrl(options.instanceDetails.databaseUrl);
    const databaseUrl = utils.getDatabaseUrl(origin, options.instance, path);
    const confirm = await promptOnce(
      {
        type: "confirm",
        name: "force",
        default: false,
        message: "You are about to remove all data at " + clc.cyan(databaseUrl) + ". Are you sure?",
      },
      options
    );
    if (!confirm) {
      return utils.reject("Command aborted.", { exit: 1 });
    }

    const removeOps = new DatabaseRemove(options.instance, path, origin);
    await removeOps.execute();
    utils.logSuccess("Data removed successfully");
  });
