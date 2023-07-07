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
import { linkGitHubRepository } from "./repo";
import { Stack, StackOutputOnlyFields } from "../../../gcp/frameworks";
import { Repository } from "../../../gcp/cloudbuild";
import * as poller from "../../../operation-poller";
import { frameworksOrigin } from "../../../api";
import * as gcp from "../../../gcp/frameworks";
import { API_VERSION } from "../../../gcp/frameworks";
import { FirebaseError } from "../../../error";

const frameworksPollerOptions: Omit<poller.OperationPollerOptions, "operationResourceName"> = {
  apiOrigin: frameworksOrigin,
  apiVersion: API_VERSION,
  masterTimeout: 25 * 60 * 1_000,
  maxBackoff: 10_000,
};

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
    labels: {},
  };
}

/**
 * Creates Stack object from long running operations.
 */
export async function createStack(
  projectId: string,
  location: string,
  stackInput: Omit<Stack, StackOutputOnlyFields>
): Promise<Stack> {
  const op = await gcp.createStack(projectId, location, stackInput);
  const stack = await poller.pollOperation<Stack>({
    ...frameworksPollerOptions,
    pollerName: `create-${projectId}-${location}-${stackInput.name}`,
    operationResourceName: op.name,
  });

  return stack;
}

/**
 * Creates Stack object.
 */
export async function getOrCreateStack(
  projectId: string,
  location: string,
  stackInput: Omit<Stack, StackOutputOnlyFields>
): Promise<Stack> {
  let stack: Stack;
  try {
    stack = await gcp.getStack(projectId, location, stackInput.name);
    if (stack) {
      throw new FirebaseError(`${stack.name} has already exists.`);
    }
  } catch (err: unknown) {
    if ((err as FirebaseError).status === 404) {
      const op = await gcp.createStack(projectId, location, stackInput);
      stack = await poller.pollOperation<Stack>({
        ...frameworksPollerOptions,
        pollerName: `create-${projectId}-${location}-${stackInput.name}`,
        operationResourceName: op.name,
      });
    } else {
      throw err;
    }
  }

  return stack;
}
