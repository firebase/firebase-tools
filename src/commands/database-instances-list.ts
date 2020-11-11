import { Command } from "../command";
import * as clc from "cli-color";
import * as ora from "ora";

import logger = require("../logger");
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import getProjectId = require("../getProjectId");
import {
  listDatabaseInstances,
  DatabaseInstance,
  DatabaseLocation,
  parseDatabaseLocation,
} from "../management/database";

function logInstances(instances: DatabaseInstance[]): void {
  if (instances.length === 0) {
    logger.info(clc.bold("No database instances found."));
    return;
  }
  instances.forEach((db) => {
    logger.info(db.name);
  });
}

const cmd = new Command("database:instances:list")
  .option(
    "-l, --location <location>",
    "(optional) location for the database instance, defaults to us-central1"
  )
  .description("list realtime database instances, optionally filtered by a specified location")
  .before(requirePermissions, ["firebasedatabase.instances.list"])
  .before(warnEmulatorNotSupported, Emulators.DATABASE)

  .action(async (options: any) => {
    const location = parseDatabaseLocation(options.location, DatabaseLocation.ANY);
    const spinner = ora(
      "Preparing the list of your Firebase Realtime Database instances" +
        `${location === DatabaseLocation.ANY ? "" : ` for location: ${location}`}`
    ).start();
    let instances;

    const projectId = getProjectId(options);
    try {
      instances = await listDatabaseInstances(projectId, location);
    } catch (err) {
      spinner.fail();
      throw err;
    }
    spinner.succeed();
    logInstances(instances);
    // logInstancesCount(instances.length);
    return instances;
    logger.info(`Project ${options.project} has ${instances.length} database instances`);
    return instances;

    for (const instance of instances) {
      logger.info(instance.instance);
    }
  });

export default cmd;
