/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

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

export let command = new Command("database:instances:list")
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
  command = command.option(
    "-l, --location <location>",
    "(optional) location for the database instance, defaults to us-central1"
  );
}
