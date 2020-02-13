import * as clc from "cli-color";
import * as fs from "fs";
import * as path from "path";
import * as rimraf from "rimraf";

import * as api from "../api";
import { Command } from "../command";
import * as commandUtils from "../emulator/commandUtils";
import * as utils from "../utils";
import { EmulatorHub } from "../emulator/hub";
import { FirebaseError } from "../error";
import { HubExport } from "../emulator/hubExport";
import { promptOnce } from "../prompt";

module.exports = new Command("emulators:export <path>")
  .description("export data from running emulators")
  .option(commandUtils.FLAG_ONLY, commandUtils.DESC_ONLY)
  .option("--force", "Overwrite any export data in the target directory.")
  .action(async (exportPath: string, options: any) => {
    const projectId = options.project;
    if (!projectId) {
      throw new FirebaseError(
        "Could not determine project ID, make sure you're running in a Firebase project directory or add the --project flag.",
        { exit: 1 }
      );
    }

    const locator = EmulatorHub.readLocatorFile(projectId);
    if (!locator) {
      throw new FirebaseError(
        `Did not find any running emulators for project ${clc.bold(projectId)}.`,
        { exit: 1 }
      );
    }
    const hubOrigin = `http://${locator.host}:${locator.port}`;

    try {
      await api.request("GET", "/", {
        origin: hubOrigin,
      });
    } catch (e) {
      const filePath = EmulatorHub.getLocatorFilePath(projectId);
      throw new FirebaseError(
        `The emulator hub at ${hubOrigin} did not respond to a status check. If this error continues try shutting down all running emulators and deleting the file ${filePath}`,
        { exit: 1 }
      );
    }

    utils.logBullet(
      `Found running emulator hub for project ${clc.bold(projectId)} at ${hubOrigin}`
    );

    // If the export target directory does not exist, we should attempt to create it
    const exportAbsPath = path.resolve(exportPath);
    if (!fs.existsSync(exportAbsPath)) {
      utils.logBullet(`Creating export directory ${exportAbsPath}`);
      fs.mkdirSync(exportAbsPath);
    }

    // Check if there is already an export there and prompt the user about deleting it
    const existingMetadata = HubExport.readMetadata(exportAbsPath);
    if (existingMetadata && !options.force) {
      if (options.noninteractive) {
        throw new FirebaseError(
          "Export already exists in the target directory, re-run with --force to overwrite.",
          { exit: 1 }
        );
      }

      const prompt = await promptOnce({
        type: "confirm",
        message: `The directory ${exportAbsPath} already contains export data. Exporting again to the same directory will overwrite all data. Do you want to continue?`,
        default: false,
      });

      if (!prompt) {
        throw new FirebaseError("Command aborted", { exit: 1 });
      }
    }

    // Remove all existing data (metadata.json will be overwritten automatically)
    if (existingMetadata) {
      if (existingMetadata.firestore) {
        const firestorePath = path.join(exportAbsPath, existingMetadata.firestore.path);
        utils.logBullet(`Deleting directory ${firestorePath}`);
        rimraf.sync(firestorePath);
      }
    }

    utils.logBullet(`Exporting data to: ${exportAbsPath}`);
    await api
      .request("POST", EmulatorHub.PATH_EXPORT, {
        origin: hubOrigin,
        json: true,
        data: {
          path: exportAbsPath,
        },
      })
      .catch((e) => {
        throw new FirebaseError("Export request failed, see emulator logs for more information.", {
          exit: 1,
          original: e,
        });
      });

    utils.logSuccess("Export complete");
  });
