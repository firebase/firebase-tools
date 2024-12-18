import { Command } from "../command.js";
import * as fsi from "../firestore/api.js";
import * as types from "../firestore/api-types.js";
import { logger } from "../logger.js";
import { requirePermissions } from "../requirePermissions.js";
import { Emulators } from "../emulator/types.js";
import { warnEmulatorNotSupported } from "../emulator/commandUtils.js";
import { FirestoreOptions } from "../firestore/options.js";
import { PrettyPrint } from "../firestore/pretty-print.js";

export const command = new Command("firestore:locations")
  .description("List possible locations for your Cloud Firestore project.")
  .before(requirePermissions, ["datastore.locations.list"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (options: FirestoreOptions) => {
    const api = new fsi.FirestoreApi();
    const printer = new PrettyPrint();

    const locations: types.Location[] = await api.locations(options.project);

    if (options.json) {
      logger.info(JSON.stringify(locations, undefined, 2));
    } else {
      printer.prettyPrintLocations(locations);
    }

    return locations;
  });
