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
      throw new FirebaseError(
        `The emulator hub at ${hubOrigin} did not respond to a status check. If this error continues try shutting down all running emulators and deleting the file ${EmulatorHub.getLocatorFilePath(
          projectId
        )}`,
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

    const exportBody = {
      path: absPath,
    };

    utils.logBullet(`Exporting data to: ${absPath}`);
    return api
      .request("POST", EmulatorHub.PATH_EXPORT, {
        origin: hubOrigin,
        json: true,
        data: exportBody,
      })
      .catch((e) => {
        throw new FirebaseError("Export request failed, see debug logs for more information.", {
          exit: 1,
          original: e,
        });
      });
  });
