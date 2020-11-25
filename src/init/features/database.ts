import * as clc from "cli-color";
import * as api from "../../api";
import { prompt, promptOnce } from "../../prompt";
import * as logger from "../../logger";
import * as utils from "../../utils";
import * as fsutils from "../../fsutils";
import Config = require("../../config");
import {
  createInstance,
  DatabaseInstance,
  DatabaseInstanceType,
  DatabaseLocation,
  checkInstanceNameAvailable,
  getDatabaseInstanceDetails,
} from "../../management/database";
import ora = require("ora");
import { ensure } from "../../ensureApiEnabled";
import { getDefaultDatabaseInstance } from "../../getDefaultDatabaseInstance";
import { FirebaseError } from "../../error";

interface DatabaseSetup {
  projectId: string;
  instance?: string;
  config?: DatabaseSetupConfig;
}

interface DatabaseSetupConfig {
  rulesFile?: string;
  defaultInstanceLocation?: DatabaseLocation;
}

const DEFAULT_RULES = JSON.stringify(
  { rules: { ".read": "auth != null", ".write": "auth != null" } },
  null,
  2
);

async function getDBRules(instanceDetails: DatabaseInstance) {
  if (!instanceDetails || !instanceDetails.name) {
    return Promise.resolve(DEFAULT_RULES);
  }
  const response = await api.request("GET", "/.settings/rules.json", {
    auth: true,
    origin: instanceDetails.databaseUrl,
  });
  return response.body;
}

async function writeDBRules(instanceDetails: DatabaseInstance, filename: string, config: Config) {
  const rules = await getDBRules(instanceDetails);
  config.writeProjectFile(filename, rules);
  utils.logSuccess(
    "Database Rules for " +
      clc.bold(instanceDetails.name) +
      " have been downloaded to " +
      clc.bold(filename) +
      "."
  );
  logger.info(
    "Future modifications to " + clc.bold(filename) + " will update Database Rules when you run"
  );
  logger.info(clc.bold("firebase deploy") + ".");
}

async function createDefaultDatabaseInstance(project: string): Promise<DatabaseInstance> {
  logger.info(
    "It seems like you haven’t initialized Realtime Database in your project yet. Let's set it up!"
  );
  const selectedLocation = await promptOnce({
    type: "list",
    message: "Please choose the location for your default Realtime Database instance:",
    choices: [
      { name: "us-central1", value: DatabaseLocation.US_CENTRAL1 },
      { name: "europe-west1", value: DatabaseLocation.EUROPE_WEST1 },
    ],
  });
  let instanceName = `${project}-default-rtdb`;
  // check if the conventional default instance name is available.
  const checkOutput = await checkInstanceNameAvailable(
    project,
    instanceName,
    DatabaseInstanceType.DEFAULT_DATABASE,
    selectedLocation
  );
  // if the conventional instance name is not available, pick the first suggestion.
  if (!checkOutput.available) {
    if (!checkOutput.suggestedIds || checkOutput.suggestedIds.length === 0) {
      logger.debug(
        `No instance names were suggested instead of conventional instance name: ${instanceName}`
      );
      throw new FirebaseError("Failed to create default RTDB instance");
    }
    instanceName = checkOutput.suggestedIds[0];
    logger.info(
      `${clc.yellow(
        "WARNING:"
      )} your project ID has the legacy name format, and the default database will be named differently: ${instanceName}`
    );
  }
  const spinner = ora(`Creating your default Realtime Database instance: ${instanceName}`).start();
  try {
    const createdInstance = await createInstance(
      project,
      instanceName,
      selectedLocation,
      DatabaseInstanceType.DEFAULT_DATABASE
    );
    spinner.succeed();
    return createdInstance;
  } catch (err) {
    spinner.fail();
    throw err;
  }
}

export async function doSetup(setup: DatabaseSetup, config: Config): Promise<void> {
  setup.config = {};
  await ensure(setup.projectId, "firebasedatabase.googleapis.com", "Realtime Database", false);
  logger.info();
  setup.instance =
    setup.instance || (await getDefaultDatabaseInstance({ project: setup.projectId }));
  const instanceDetails =
    setup.instance !== ""
      ? await getDatabaseInstanceDetails(setup.projectId, setup.instance)
      : await createDefaultDatabaseInstance(setup.projectId);
  let filename = null;

  logger.info();
  logger.info("Firebase Realtime Database Rules allow you to define how your data should be");
  logger.info("structured and when your data can be read from and written to.");
  logger.info();

  await prompt(setup.config, [
    {
      type: "input",
      name: "rulesFile",
      message: "What file should be used for Database Rules?",
      default: "database.rules.json",
    },
  ]);
  filename = setup.config.rulesFile!;
  let writeRules = true;
  if (fsutils.fileExistsSync(filename)) {
    const msg =
      "File " +
      clc.bold(filename) +
      " already exists." +
      " Do you want to overwrite it with the Database Rules for " +
      clc.bold(instanceDetails.name) +
      " from the Firebase Console?";
    writeRules = await promptOnce({
      type: "confirm",
      message: msg,
      default: false,
    });
  }
  if (writeRules) {
    return writeDBRules(instanceDetails, filename, config);
  }
  logger.info("Skipping overwrite of Database Rules.");
  logger.info(
    "The rules defined in " +
      clc.bold(filename) +
      " will be published when you do " +
      clc.bold("firebase deploy") +
      "."
  );
  return Promise.resolve();
}
