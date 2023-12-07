import * as clc from "colorette";
import * as repo from "./repo";
import * as poller from "../../../operation-poller";
import * as gcp from "../../../gcp/frameworks";
import { logBullet, logSuccess, logWarning } from "../../../utils";
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

  const location = await promptOnce({
    name: "region",
    type: "list",
    default: DEFAULT_REGION,
    message:
      "Please select a region " +
      `(${clc.yellow("info")}: Your region determines where your backend is located):\n`,
    choices: ALLOWED_REGIONS,
  });

  logSuccess(`Region set to ${location}.\n`);

  let backendId: string;
  while (true) {
    backendId = await promptOnce({
      name: "backendId",
      type: "input",
      default: "acme-inc-web",
      message: "Create a name for your backend [1-30 characters]",
    });
    try {
      await gcp.getBackend(projectId, location, backendId);
    } catch (err: any) {
      if (err.status === 404) {
        break;
      }
      throw new FirebaseError(
        `Failed to check if backend with id ${backendId} already exists in ${location}`,
        { original: err }
      );
    }
    logWarning(`Backend with id ${backendId} already exists in ${location}`);
  }
  const backend: Backend = await onboardBackend(projectId, location, backendId);

  if (backend) {
    logSuccess(`Successfully created backend:\n\t${backend.name}`);
    logSuccess(`Your site is being deployed at:\n\thttps://${backend.uri}`);
    logSuccess(
      `View the rollout status by running:\n\tfirebase backends:get ${backendId} --project ${projectId}`
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
 * Walkthrough the flow for creating a new backend.
 */
export async function onboardBackend(
  projectId: string,
  location: string,
  backendId: string
): Promise<Backend> {
  const cloudBuildConnRepo = await repo.linkGitHubRepository(projectId, location);
  const barnchName = await promptOnce({
    name: "branchName",
    type: "input",
    default: "main",
    message: "Which branch do you want to deploy?",
  });
  // branchName unused for now.
  void barnchName;
  const backendDetails = toBackend(cloudBuildConnRepo);
  return await createBackend(projectId, location, backendDetails, backendId);
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
