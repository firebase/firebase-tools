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
import { linkGitHubRepository } from "../composer/repo";
import { Stack, StackOutputOnlyFields } from "../../../frameworks/compose/api/interfaces";
import { Repository } from "../../../gcp/cloudbuild";
import { createStack } from "../../../frameworks/compose/api/frameworks/operationsCoverter";

/**
 * Setup new frameworks project.
 */
export async function doSetup(setup: any): Promise<void> {
  const projectId: string = setup?.rcfile?.projects?.default;
  setup.frameworks = {};

  utils.logBullet("First we need a few details to create your service.");

  await promptOnce(
    {
      name: "serviceName",
      type: "input",
      default: "acme-inc-web",
      message: "Create a name for your service [6-32 characters]",
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

  if (setup.frameworks.deployMethod === "github") {
    const cloudBuildConnRepo = await linkGitHubRepository(
      projectId,
      setup.frameworks.region,
      setup.frameworks.serviceName
    );
    const stackDetails = toStack(cloudBuildConnRepo, setup.frameworks.serviceName);
    await createStack(projectId, setup.frameworks.region, stackDetails);
  }
}

function toStack(
  cloudBuildConnRepo: Repository,
  stackId: string
): Omit<Stack, StackOutputOnlyFields> {
  return {
    name: stackId,
    codebase: { repository: cloudBuildConnRepo.name, rootDirectory: "/" },
    labels: {},
  };
}
