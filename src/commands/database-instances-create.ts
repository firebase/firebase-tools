import { Command } from "../command";
import logger = require("../logger");
import { requirePermissions } from "../requirePermissions";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { Emulators } from "../emulator/types";
import {
  createInstance,
  DatabaseInstanceType,
  DatabaseLocation,
  parseDatabaseLocation,
} from "../management/database";
import getProjectId = require("../getProjectId");
import { getDefaultDatabaseInstance } from "../getDefaultDatabaseInstance";
import { FirebaseError } from "../error";
import * as clc from "cli-color";

export default new Command("database:instances:create <instanceName>")
  .description("create a realtime database instance")
  .option(
    "-l, --location <location>",
    "(optional) location for the database instance, defaults to us-central1"
  )
  .before(requirePermissions, ["firebasedatabase.instances.create"])
  .before(warnEmulatorNotSupported, Emulators.DATABASE)
  .action(async (instanceName: string, options: any) => {
    const projectId = getProjectId(options);
    const defaultDatabaseInstance = await getDefaultDatabaseInstance({ project: projectId });
    if (defaultDatabaseInstance === "") {
      throw new FirebaseError(
        `It looks like you haven't created a Realtime Database instance in this project before. Please run ${clc.cyan.bold(
          "firebase init"
        )} and select ${clc.yellow(
          "Realtime Database"
        )} to create your default Realtime Database instance.`
      );
    }
    const location = parseDatabaseLocation(options.location, DatabaseLocation.US_CENTRAL1);
    const instance = await createInstance(
      projectId,
      instanceName,
      location,
      DatabaseInstanceType.USER_DATABASE
    );
    logger.info(`created database instance ${instance.name}`);
    return instance;
  });
