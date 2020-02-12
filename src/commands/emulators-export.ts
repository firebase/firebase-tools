import * as clc from "cli-color";
import * as fs from "fs";
import * as path from "path";

import * as api from "../api";
import { Command } from "../command";
import * as commandUtils from "../emulator/commandUtils";
import * as utils from "../utils";
import { EmulatorHub } from "../emulator/hub";
import { FirebaseError } from "../error";

module.exports = new Command("emulators:export <path>")
  .description("export data from running emulators")
  .option(commandUtils.FLAG_ONLY, commandUtils.DESC_ONLY)
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
    const absPath = path.resolve(exportPath);
    if (!fs.existsSync(absPath)) {
      utils.logBullet(`Creating export directory ${absPath}`);
      fs.mkdirSync(absPath);
    }

    utils.logBullet(`Exporting data to: ${absPath}`);
    await api
      .request("POST", EmulatorHub.PATH_EXPORT, {
        origin: hubOrigin,
        json: true,
        data: {
          path: absPath,
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
