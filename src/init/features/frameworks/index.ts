import * as clc from "colorette";
import * as utils from "../../../utils";
import { logger } from "../../../logger";
import { promptOnce } from "../../../prompt";
import {
  DEFAULT_REGION,
  ALLOWED_REGIONS,
  DEFAULT_DEPLOY_METHOD,
  ALLOWED_DEPLOY_METHODS,
} from "./constants";
import { Options } from "../../../options";
import { ensure } from "../../../ensureApiEnabled";
import { Config } from "../../../config";
import { requirePermissions } from "../../../requirePermissions";
import { isEnabled } from "../../../experiments";

/**
 * Setup new frameworks project.
 */
export async function doSetup(setup: any, config: Config, options: Options): Promise<void> {
  const projectId = setup?.rcfile?.projects?.default;
  if (projectId && !isEnabled("frameworks")) {
    await requirePermissions({ ...options, project: projectId });
    await Promise.all([ensure(projectId, "placeholder.googleapis.com", "unused", true)]);
  }

  setup.frameworks = {};

  utils.logBullet("First we need a few details to create your service.");

  await promptOnce(
    {
      name: "serviceName",
      type: "input",
      default: "acme-inc-web",
      message: "Create a name for your service [1-64 characters]",
    },
    setup.frameworks
  );

  await promptOnce(
    {
      name: "region",
      type: "list",
      default: DEFAULT_REGION,
      message:
        "Please select a region " +
        `(${clc.yellow("info")}: Your region determines where your backend is located):\n`,
      choices: ALLOWED_REGIONS,
    },
    setup.frameworks
  );

  utils.logSuccess(`Region set to ${setup.frameworks.region}.`);

  logger.info(clc.bold(`\n${clc.white("===")} Deploy Setup`));

  await promptOnce(
    {
      name: "deployMethod",
      type: "list",
      default: DEFAULT_DEPLOY_METHOD,
      message: "How do you want to deploy",
      choices: ALLOWED_DEPLOY_METHODS,
    },
    setup.frameworks
  );
}
