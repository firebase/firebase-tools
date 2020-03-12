import { Command } from "../command";
import logger = require("../logger");
import { requirePermissions } from "../requirePermissions";
import getProjectNumber = require("../getProjectNumber");
import instances = require("../database/instances");

export default new Command("database:instances:create <instanceName>")
  .description("create a realtime database instance")
  .before(requirePermissions, ["firebasedatabase.instances.create"])
  .action(async (instanceName: string, options: any) => {
    const projectNumber = await getProjectNumber(options);
    const instance = await instances.createDatabaseInstance(projectNumber, instanceName);
    logger.info(`created database instance ${instance.name}`);
    return instance;
  });
