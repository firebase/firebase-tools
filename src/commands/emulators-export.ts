import * as clc from "cli-color";
import * as request from "request";
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

    // TODO: Should we ping the / endpoint to make sure
    const absPath = path.resolve(exportPath);
    utils.logBullet(
      `Found running emulator hub for project ${clc.bold(projectId)} at http://${locator.host}:${
        locator.port
      }`
    );
    utils.logBullet(`Exporting data to: ${absPath}`);

    const exportOrigin = `http://${locator.host}:${locator.port}`;
    const exportBody = {
      path: absPath,
    };

    // TODO: Handle errors nicely here
    return api.request("POST", "/_admin/export", {
      origin: exportOrigin,
      json: true,
      data: exportBody,
    });
  });
