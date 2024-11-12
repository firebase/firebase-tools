import * as clc from "colorette";
import * as utils from "../../utils";
import { Config } from "../../config";
import { readTemplateSync } from "../../templates";
import { checkBillingEnabled } from "../../gcp/cloudbilling";

const APPHOSTING_YAML_TEMPLATE = readTemplateSync("init/apphosting/apphosting.yaml");

/**
 * Set up an apphosting.yaml file for a new App Hosting project.
 */
export async function doSetup(setup: any, config: Config): Promise<void> {
  await checkBillingEnabled(setup.projectId);
  utils.logBullet("Writing default settings to " + clc.bold("apphosting.yaml") + "...");
  await config.askWriteProjectFile("apphosting.yaml", APPHOSTING_YAML_TEMPLATE);
  utils.logSuccess("Create a new App Hosting backend with `firebase apphosting:backends:create`");
}
