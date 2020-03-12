import { Command } from "../command";
import logger = require("../logger");
import { requirePermissions } from "../requirePermissions";
import getProjectNumber = require("../getProjectNumber");
import firebaseDatabase = require("../database/instances");

export default new Command("database:instances:list")
  .description("list realtime database instances")
  .before(requirePermissions, ["firebasedatabase.instances.list"])
  .action(async (options: any) => {
    const projectNumber = await getProjectNumber(options);
    const instances = await firebaseDatabase.listDatabaseInstances(projectNumber);
    for (const instance of instances) {
      const segments = instance.name.split('/');
      logger.info(segments[segments.length - 1]);
    }
    logger.info(`Project ${options.project} has ${instances.length} database instances`);
    return instances;
  });
