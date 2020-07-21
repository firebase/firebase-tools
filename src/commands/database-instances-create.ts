import { Command } from "../command";
import logger = require("../logger");
import { requirePermissions } from "../requirePermissions";
import getProjectNumber = require("../getProjectNumber");
import firedata = require("../gcp/firedata");
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { Emulators } from "../emulator/types";
import { previews } from "../previews";
import { createInstance, parseDatabaseLocation } from "../management/database";
import getProjectId = require("../getProjectId");

export default new Command("database:instances:create <instanceName>")
  .description("create a realtime database instance")
  .option(
    "-l, --location <location>",
    "(optional) location for the database instance, defaults to us-central1"
  )
  .before(requirePermissions, ["firebasedatabase.instances.create"])
  .before(warnEmulatorNotSupported, Emulators.DATABASE)
  .action(async (instanceName: string, options: any) => {
    if (previews.rtdbmanagement) {
      const projectId = getProjectId(options);
      const location = parseDatabaseLocation(options.location);
      const instance = await createInstance(projectId, instanceName, location);
      logger.info(`created database instance ${instance.name}`);
      return instance;
    }
    const projectNumber = await getProjectNumber(options);
    const instance = await firedata.createDatabaseInstance(projectNumber, instanceName);
    logger.info(`created database instance ${instance.instance}`);
    return instance;
  });
