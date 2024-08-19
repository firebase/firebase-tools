const Table = require("cli-table");

import { Command } from "../command";
import * as clc from "colorette";
import * as ora from "ora";

import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import * as experiments from "../experiments";
import { needProjectId } from "../projectUtils";
import {
  listDatabaseInstances,
  DatabaseInstance,
  DatabaseLocation,
  parseDatabaseLocation,
} from "../management/database";

export const command = new Command("database:instances:list")
  .description("list realtime database instances, optionally filtered by a specified location")
  .before(requirePermissions, ["firebasedatabase.instances.list"])
  .option(
    "-l, --location <location>",
    "(optional) location for the database instance, defaults to all regions",
  )
  .before(warnEmulatorNotSupported, Emulators.DATABASE)
  .action(async (options: any) => {
    const location = parseDatabaseLocation(options.location, DatabaseLocation.ANY);
    const spinner = ora(
      "Preparing the list of your Firebase Realtime Database instances" +
        `${location === DatabaseLocation.ANY ? "" : ` for location: ${location}`}`,
    ).start();

    const projectId = needProjectId(options);
    let instances: DatabaseInstance[] = [];
    try {
      instances = await listDatabaseInstances(projectId, location);
    } catch (err: any) {
      spinner.fail();
      throw err;
    }
    spinner.succeed();
    if (instances.length === 0) {
      logger.info(clc.bold("No database instances found."));
      return;
    }
    // TODO: remove rtdbmanagement experiment in the next major release.
    if (!experiments.isEnabled("rtdbmanagement")) {
      for (const instance of instances) {
        logger.info(instance.name);
      }
      logger.info(`Project ${options.project} has ${instances.length} database instances`);
      return instances;
    }
    const tableHead = ["Database Instance Name", "Location", "Type", "State"];
    const table = new Table({ head: tableHead, style: { head: ["green"] } });
    for (const db of instances) {
      table.push([db.name, db.location, db.type, db.state]);
    }
    logger.info(table.toString());
    logger.info(`${instances.length} database instance(s) total.`);
    return instances;
  });
