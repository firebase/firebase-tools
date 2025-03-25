import { Command } from "../command";
import * as fsi from "../firestore/api";
import * as types from "../firestore/api-types";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";
import { PrettyPrint } from "../firestore/pretty-print";

export const command = new Command("firestore:locations")
  .description("list possible locations for your Cloud Firestore database")
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
