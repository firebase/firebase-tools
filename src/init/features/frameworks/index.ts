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
import * as repo from "./repo";
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
export async function doSetup(setup: any, projectId: string): Promise<void> {
  setup.frameworks = {};

  utils.logBullet("First we need a few details to create your service.");

  await promptOnce(
    {
      name: "serviceName",
      type: "input",
      default: "acme-inc-web",
      message: "Create a name for your service [1-30 characters]",
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

  const stack: Stack | undefined = await getOrCreateStack(projectId, setup);
  if (stack) {
    utils.logSuccess(`Successfully created a stack: ${stack.name}`);
  }
}

function toStack(cloudBuildConnRepo: Repository): Omit<Stack, StackOutputOnlyFields> {
  return {
    codebase: {
      repository: `${cloudBuildConnRepo.name}`,
      rootDirectory: "/",
    },
    labels: {},
  };
}

/**
 * Creates stack if it doesn't exist.
 */
export async function getOrCreateStack(projectId: string, setup: any): Promise<Stack | undefined> {
  const location: string = setup.frameworks.region;
  const deployMethod: string = setup.frameworks.deployMethod;
  try {
    return await getExistingStack(projectId, setup, location);
  } catch (err: unknown) {
    if ((err as FirebaseError).status === 404) {
      logger.info("Creating new stack.");
      if (deployMethod === "github") {
        const cloudBuildConnRepo = await repo.linkGitHubRepository(projectId, location);
        const stackDetails = toStack(cloudBuildConnRepo);
        return await createStack(projectId, location, stackDetails, setup.frameworks.serviceName);
      }
    } else {
      throw new FirebaseError(
        `Failed to get or create a stack using the given initialization details: ${err}`
      );
    }
  }

  return undefined;
}

async function getExistingStack(projectId: string, setup: any, location: string): Promise<Stack> {
  let stack = await gcp.getBackend(projectId, location, setup.frameworks.serviceName);
  while (stack) {
    setup.frameworks.serviceName = undefined;
    await promptOnce(
      {
        name: "existingStack",
        type: "confirm",
        default: true,
        message:
          "A stack already exists for the given serviceName, do you want to use existing stack? (yes/no)",
      },
      setup.frameworks
    );
    if (setup.frameworks.existingStack) {
      logger.info("Using the existing stack.");
      return stack;
    }
    await promptOnce(
      {
        name: "serviceName",
        type: "input",
        default: "acme-inc-web",
        message: "Please enter a new service name [1-30 characters]",
      },
      setup.frameworks
    );
    stack = await gcp.getBackend(projectId, location, setup.frameworks.serviceName);
    setup.frameworks.existingStack = undefined;
  }

  return stack;
}

/**
 * Creates Stack object from long running operations.
 */
export async function createStack(
  projectId: string,
  location: string,
  stackReqBoby: Omit<Stack, StackOutputOnlyFields>,
  stackId: string
): Promise<Stack> {
  const op = await gcp.createStack(projectId, location, stackReqBoby, stackId);
  const stack = await poller.pollOperation<Stack>({
    ...frameworksPollerOptions,
    pollerName: `create-${projectId}-${location}-${stackId}`,
    operationResourceName: op.name,
  });

  return stack;
}
