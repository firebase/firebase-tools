import { Command } from "../command";
import logger = require("../logger");
import { requirePermissions } from "../requirePermissions";
import getProjectNumber = require("../getProjectNumber");
import firedata = require("../gcp/firedata");
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { Emulators } from "../emulator/types";

export default new Command("database:instances:create <instanceName>")
  .description("create a realtime database instance")
  .before(requirePermissions, ["firebasedatabase.instances.create"])
  .before(warnEmulatorNotSupported, Emulators.DATABASE)
  .action(async (instanceName: string, options: any) => {
    const projectNumber = await getProjectNumber(options);
    const instance = await firedata.createDatabaseInstance(projectNumber, instanceName);
    logger.info(`created database instance ${instance.instance}`);
    return instance;
  });
