import * as logger from "../../logger";
import { promptOnce } from "../../prompt";
import clc = require("cli-color");

let fsutils = require("../../fsutils");

export async function doSetup(setup: any, config: any, options: any): Promise<void> {
  setup.config.remoteconfig = {};
  logger.info("Firebase requires a default path to store the remote config template json file.");
  const jsonFilePath = await promptOnce({
    type: "input",
    name: "template",
    message: "What is the path file you want to store your template.json?",
    default: "remoteconfig.template.json",
  });
  logger.info(jsonFilePath);
  if (fsutils.fileExistsSync(jsonFilePath)) {
    const msg =
      "File " +
      clc.bold(jsonFilePath) +
      " already exists." +
      " Do you want to overwrite it with the Remote Config Template from the Firebase Console?";
    const overwrite = await promptOnce({
      type: "confirm",
      message: msg,
      default: false,
    });
    if (overwrite == true) {
      setup.config.remoteconfig.template = jsonFilePath;
      logger.info(setup.config.remoteconfig.template);
    } else {
      setup.config.remoteconfig.template = jsonFilePath;
    }
  }
  config.writeProjectFile(setup.config.remoteconfig.template, "");
}
