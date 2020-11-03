import { Command } from "../command";
import logger = require("../logger");
import { requirePermissions } from "../requirePermissions";
import getProjectNumber = require("../getProjectNumber");
import firedata = require("../gcp/firedata");
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { Emulators } from "../emulator/types";
import { previews } from "../previews";
import { createInstance, DatabaseLocation, parseDatabaseLocation } from "../management/database";
import getProjectId = require("../getProjectId");

let cmd = new Command("database:instances:create <instanceName>")
  .description("create a realtime database instance")

  .before(requirePermissions, ["firebasedatabase.instances.create"])
  .before(warnEmulatorNotSupported, Emulators.DATABASE)
  .action(async (instanceName: string, options: any) => {
    if (previews.rtdbmanagement) {
      const projectId = getProjectId(options);
      const location = parseDatabaseLocation(options.location, DatabaseLocation.US_CENTRAL1);
      const instance = await createInstance(projectId, instanceName, location);
      logger.info(`created database instance ${instance.name}`);
      return instance;
    }
    const projectNumber = await getProjectNumber(options);
    const instance = await firedata.createDatabaseInstance(projectNumber, instanceName);
    logger.info(`created database instance ${instance.instance}`);
    return instance;
  });
if (previews.rtdbmanagement) {
  cmd = cmd.option(
    "-l, --location <location>",
    "(optional) location for the database instance, defaults to us-central1"
  );
}
export default cmd;
