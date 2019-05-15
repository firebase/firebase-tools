import Command = require("../command");
import logger = require("../logger");
import requirePermissions = require("../requirePermissions");
import getProjectNumber = require("../getProjectNumber");
import firedata = require("../gcp/firedata");

export default new Command("database:instances:list")
  .description("list realtime database instances")
  .before(requirePermissions, ["firebase.projects.list"])
  .action(async (options: any) => {
    const projectNumber = await getProjectNumber(options);
    const instances = await firedata.listDatabaseInstances(projectNumber);
    for (const instance of instances) {
      logger.info(instance.instance);
    }
    logger.info(`Project ${options.project} has ${instances.length} database instances`);
    return instances;
  });
