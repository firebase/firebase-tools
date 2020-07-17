import * as logger from "../../logger";
import { promptOnce } from "../../prompt";
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
  setup.config.remoteconfig.template = jsonFilePath;
  logger.info(setup.config.remoteconfig.template);
  config.writeProjectFile(setup.config.remoteconfig.template, "");
}
