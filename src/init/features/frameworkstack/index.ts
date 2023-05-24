import * as clc from "colorette";
import { Options } from "../../../options";
import { Config } from "../../../config";
import { requirePermissions } from "../../../requirePermissions";
import { ensure } from "../../../ensureApiEnabled";
import * as utils from "../../../utils";
import { logger } from "../../../logger";
import { promptOnce } from "../../../prompt";
import {
  DEFAULT_REGION,
  ALLOWED_REGIONS,
  DEFAULT_DEPLOY_METHOD,
  ALLOWED_DEPLOY_METHODS,
} from "./constants";

/**
 * Setup new Frameworkstack project.
 */
export async function doSetup(setup: any, config: Config, options: Options): Promise<void> {
  const projectId = setup?.rcfile?.projects?.default;
  if (projectId) {
    await requirePermissions({ ...options, project: projectId });
    await Promise.all([ensure(projectId, "firebaseextensions.googleapis.com", "unused", true)]);
  }
  setup.frameworkstack = {};

  utils.logBullet("First we need a few details to create your service.");

  await promptOnce(
    {
      name: "serviceName",
      type: "input",
      default: "acme-inc-web",
      message: "Create a name for your service [1-64 characters]",
    },
    setup.frameworkstack
  );

  await promptOnce(
    {
      name: "regionName",
      type: "list",
      default: DEFAULT_REGION,
      message:
        "Please select a region " +
        `(${clc.yellow("info")}: Your region determines where your backend is located):\n`,
      choices: ALLOWED_REGIONS,
    },
    setup.frameworkstack
  );

  utils.logSuccess(`Region set to ${setup.frameworkstack.regionName}.`);

  logger.info(clc.bold(`\n${clc.white("===")} Deploy Setup`));

  await promptOnce(
    {
      name: "deployMethod",
      type: "list",
      default: DEFAULT_DEPLOY_METHOD,
      message: "How do you want to deploy",
      choices: ALLOWED_DEPLOY_METHODS,
    },
    setup.frameworkstack
  );
}
