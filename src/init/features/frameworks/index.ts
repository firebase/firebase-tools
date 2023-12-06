import * as clc from "colorette";
import * as repo from "./repo";
import * as poller from "../../../operation-poller";
import * as gcp from "../../../gcp/frameworks";
import { logBullet, logSuccess } from "../../../utils";
import { frameworksOrigin } from "../../../api";
import { Backend, BackendOutputOnlyFields } from "../../../gcp/frameworks";
import { Repository } from "../../../gcp/cloudbuild";
import { API_VERSION } from "../../../gcp/frameworks";
import { FirebaseError } from "../../../error";
import { promptOnce } from "../../../prompt";
import { DEFAULT_REGION, ALLOWED_REGIONS } from "./constants";

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

  logBullet("First we need a few details to create your backend.");

  await promptOnce(
    {
      name: "serviceName",
      type: "input",
      default: "acme-inc-web",
      message: "Create a name for your backend [1-30 characters]",
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

  logSuccess(`Region set to ${setup.frameworks.region}.\n`);

  const backend: Backend | undefined = await getOrCreateBackend(projectId, setup);

  if (backend) {
    logSuccess(`Successfully created backend:\n ${backend.name}`);
    logSuccess(`Your site is being deployed at:\n https://${backend.uri}\n`);
    logSuccess(
      `View the rollout status by running:\n firebase backends:get --backend=${backend.name}\n`
    );
  }
}

function toBackend(cloudBuildConnRepo: Repository): Omit<Backend, BackendOutputOnlyFields> {
  return {
    servingLocality: "GLOBAL_ACCESS",
    codebase: {
      repository: `${cloudBuildConnRepo.name}`,
      rootDirectory: "/",
    },
    labels: {},
  };
}

/**
 * Creates backend if it doesn't exist.
 */
export async function getOrCreateBackend(
  projectId: string,
  setup: any
): Promise<Backend | undefined> {
  const location: string = setup.frameworks.region;
  try {
    return await getExistingBackend(projectId, setup, location);
  } catch (err: unknown) {
    if ((err as FirebaseError).status === 404) {
      const cloudBuildConnRepo = await repo.linkGitHubRepository(projectId, location);
      await promptOnce(
        {
          name: "branchName",
          type: "input",
          default: "main",
          message: "Which branch do you want to deploy?",
        },
        setup.frameworks
      );
      const backendDetails = toBackend(cloudBuildConnRepo);
      logBullet(clc.bold(`${clc.white("===")} Creating your backend`));
      return await createBackend(projectId, location, backendDetails, setup.frameworks.serviceName);
    } else {
      throw new FirebaseError(
        `Failed to get or create a backend using the given initialization details: ${err}`
      );
    }
  }

  return undefined;
}

async function getExistingBackend(
  projectId: string,
  setup: any,
  location: string
): Promise<Backend> {
  let backend = await gcp.getBackend(projectId, location, setup.frameworks.serviceName);
  while (backend) {
    setup.frameworks.serviceName = undefined;
    await promptOnce(
      {
        name: "existingBackend",
        type: "confirm",
        default: true,
        message:
          "A backend already exists for the given serviceName, do you want to use existing backend? (yes/no)",
      },
      setup.frameworks
    );
    if (setup.frameworks.existingBackend) {
      logBullet("Using the existing backend.");
      return backend;
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
    backend = await gcp.getBackend(projectId, location, setup.frameworks.serviceName);
    setup.frameworks.existingBackend = undefined;
  }

  return backend;
}

/**
 * Creates backend object from long running operations.
 */
export async function createBackend(
  projectId: string,
  location: string,
  backendReqBoby: Omit<Backend, BackendOutputOnlyFields>,
  backendId: string
): Promise<Backend> {
  const op = await gcp.createBackend(projectId, location, backendReqBoby, backendId);
  const backend = await poller.pollOperation<Backend>({
    ...frameworksPollerOptions,
    pollerName: `create-${projectId}-${location}-${backendId}`,
    operationResourceName: op.name,
  });

  return backend;
}
