import { Command } from "../command";
import * as clc from "colorette";
import * as fsi from "../firestore/api";
import * as types from "../firestore/api-types";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";

export const command = new Command("firestore:locations")
  .description("List possible locations for your Cloud Firestore project.")
  .option(
    "--pretty",
    "Pretty print {Display name}: {locationId}. When not specified the locations are printed in the " +
      "JSON specification format."
  )
  .before(requirePermissions, ["datastore.databases.list"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (options: FirestoreOptions) => {
    const api = new fsi.FirestoreApi();

    const locations: types.Location[] = await api.locations(options.project);

    if (options.pretty) {
      logger.info(clc.bold(clc.white("Firestore Locations")));
      api.prettyPrintLocations(locations);
    } else {
      logger.info(JSON.stringify(locations, undefined, 2));
    }

    return locations;
  });
