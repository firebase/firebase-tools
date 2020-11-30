import { Command } from "../command";
import logger = require("../logger");
import { requirePermissions } from "../requirePermissions";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { Emulators } from "../emulator/types";
import {
  createInstance,
  DatabaseInstanceType,
  DatabaseLocation,
  parseDatabaseLocation,
} from "../management/database";
import getProjectId = require("../getProjectId");

export default new Command("database:instances:create <instanceName>")
  .description("create a realtime database instance")
  .option(
    "-l, --location <location>",
    "(optional) location for the database instance, defaults to us-central1"
  )
  .before(requirePermissions, ["firebasedatabase.instances.create"])
  .before(warnEmulatorNotSupported, Emulators.DATABASE)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .action(async (instanceName: string, options: any) => {
    const projectId = getProjectId(options);
    const location = parseDatabaseLocation(options.location, DatabaseLocation.US_CENTRAL1);
    const instance = await createInstance(
      projectId,
      instanceName,
      location,
      DatabaseInstanceType.USER_DATABASE
    );
    logger.info(`created database instance ${instance.name}`);
    return instance;
  });
