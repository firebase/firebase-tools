import { input, confirm } from "../../prompt";
import * as fsutils from "../../fsutils";
import * as clc from "colorette";
import { Config } from "../../config";
import { Setup } from "..";

/**
 * Function retrieves names for parameters and parameter groups
 * @param setup Input is of RemoteConfigSetup defined in interfaces above
 * @param config Input is of type Config
 * @return {Promise} Returns a promise and writes the project file for remoteconfig template when initializing
 */
export async function doSetup(setup: Setup, config: Config): Promise<void> {
  const jsonFilePath = await input({
    message: "What file should be used for your Remote Config template?",
    default: "remoteconfig.template.json",
  });
  if (fsutils.fileExistsSync(jsonFilePath)) {
    const msg =
      "File " +
      clc.bold(jsonFilePath) +
      " already exists." +
      " Do you want to overwrite the existing Remote Config template?";
    const overwrite = await confirm(msg);
    if (!overwrite) {
      return;
    }
  }
  setup.config.remoteconfig = {
    template: jsonFilePath,
  };
  config.writeProjectFile(setup.config.remoteconfig.template, "{}");
}
