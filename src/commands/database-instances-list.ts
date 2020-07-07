import { Command } from "../command";
import logger = require("../logger");
import { requirePermissions } from "../requirePermissions";
import getProjectNumber = require("../getProjectNumber");
import firedata = require("../gcp/firedata");
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";

export default new Command("database:instances:list")
  .description("list realtime database instances")
  .before(requirePermissions, ["firebasedatabase.instances.list"])
  .before(warnEmulatorNotSupported, Emulators.DATABASE)
  .action(async (options: any) => {
    const projectNumber = await getProjectNumber(options);
    const instances = await firedata.listDatabaseInstances(projectNumber);
    for (const instance of instances) {
      logger.info(instance.instance);
    }
    logger.info(`Project ${options.project} has ${instances.length} database instances`);
    return instances;
  });
