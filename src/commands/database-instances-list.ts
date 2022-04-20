import { Command } from "../command";
import Table = require("cli-table");
import * as clc from "cli-color";
import * as ora from "ora";

import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { needProjectNumber } from "../projectUtils";
import firedata = require("../gcp/firedata");
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { previews } from "../previews";
import { needProjectId } from "../projectUtils";
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
  const tableHead = ["Database Instance Name", "Location", "Type", "State"];
  const table = new Table({ head: tableHead, style: { head: ["green"] } });
  instances.forEach((db) => {
    table.push([db.name, db.location, db.type, db.state]);
  });

  logger.info(table.toString());
}

function logInstancesCount(count = 0): void {
  if (count === 0) {
    return;
  }
  logger.info("");
  logger.info(`${count} database instance(s) total.`);
}

let cmd = new Command("database:instances:list")
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

    if (previews.rtdbmanagement) {
      const projectId = needProjectId(options);
      try {
        instances = await listDatabaseInstances(projectId, location);
      } catch (err: any) {
        spinner.fail();
        throw err;
      }
      spinner.succeed();
      logInstances(instances);
      logInstancesCount(instances.length);
      return instances;
    }
    const projectNumber = await needProjectNumber(options);
    try {
      instances = await firedata.listDatabaseInstances(projectNumber);
    } catch (err: any) {
      spinner.fail();
      throw err;
    }
    spinner.succeed();
    for (const instance of instances) {
      logger.info(instance.instance);
    }
    logger.info(`Project ${options.project} has ${instances.length} database instances`);
    return instances;
  });

if (previews.rtdbmanagement) {
  cmd = cmd.option(
    "-l, --location <location>",
    "(optional) location for the database instance, defaults to us-central1"
  );
}
export default cmd;
