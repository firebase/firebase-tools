import { Command } from "../command";
import * as fsi from "../firestore/api";
import * as types from "../firestore/api-types";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";

export const command = new Command("firestore:locations")
  .description("List possible locations for your Cloud Firestore project.")
  .option("--json", "Prints raw json response of the locations API call if specified")
  .before(requirePermissions, ["datastore.locations.list"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (options: FirestoreOptions) => {
    const api = new fsi.FirestoreApi();

    const locations: types.Location[] = await api.locations(options.project);

    if (options.json) {
      logger.info(JSON.stringify(locations, undefined, 2));
    } else {
      api.prettyPrintLocations(locations);
    }

    return locations;
  });
