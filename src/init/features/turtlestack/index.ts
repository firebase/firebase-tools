import * as clc from "colorette";
import { Options } from "../../../options";
import { Config } from "../../../config";
import { requirePermissions } from "../../../requirePermissions";
import { ensure } from "../../../ensureApiEnabled";
import * as ora from "ora";
import { discoverFramework } from "./discovery";
import * as utils from "../../../utils";
import { NEXT_JS, ANGULAR } from "./frameworks";
import { logger } from "../../../logger";

const frameworks = new Set<string>([NEXT_JS, ANGULAR]);
/**
 * Setup new Turtlestack project.
 */
export async function doSetup(setup: any, config: Config, options: Options): Promise<void> {
  const projectId = setup?.rcfile?.projects?.default;
  if (projectId) {
    await requirePermissions({ ...options, project: projectId });
    await Promise.all([ensure(projectId, "firebaseextensions.googleapis.com", "unused", true)]);
  }

  const spinner = ora("Examining your source code").start();
  let discoveredData: any;
  try {
    discoveredData = await discoverFramework(); // wait for response until framework is discovered.
    spinner.succeed();
  } catch (error) {
    spinner.fail("Failed to discover the framework.");
    throw error;
  }
  utils.logBullet("Writing configuration info to " + clc.bold("firebase.json") + "...");
  if (frameworks.has(discoveredData.framework)) {
    utils.logBullet(`Detected ${discoveredData.framework} application in the root directory!`);
    utils.logBullet(
      "Based on your " +
        clc.bold("package.json") +
        " we have pre-filled the following project settings:"
    );
    logger.info("root directory: " + discoveredData.rootDirectory);
    logger.info("build command: " + clc.blue(discoveredData.buildCommand));
    logger.info("install command: " + clc.blue(discoveredData.installCommand));
    logger.info("output directory: " + clc.blue(discoveredData.outputDirectory));
  }
}
