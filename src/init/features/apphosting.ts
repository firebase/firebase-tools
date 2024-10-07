import * as clc from "colorette";
import * as utils from "../../utils";
import { Options } from "../../options";
import { Config } from "../../config";
import { readTemplateSync } from "../../templates";

const APPHOSTING_YAML_TEMPLATE = readTemplateSync("init/apphosting/apphosting.yaml");

/**
 * Set up an apphosting.yaml file for a new App Hosting project.
 */
export async function doSetup(setup: any, config: Config, options: Options): Promise<void> {
  const path = `apphosting.yaml`;
  utils.logBullet("Writing default settings to " + clc.bold("apphosting.yaml") + "...");
  await config.askWriteProjectFile(path, APPHOSTING_YAML_TEMPLATE);
}
