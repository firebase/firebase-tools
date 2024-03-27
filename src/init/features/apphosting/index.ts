import * as clc from "colorette";

import * as repo from "./repo";
import * as poller from "../../../operation-poller";
import * as apphosting from "../../../gcp/apphosting";
import { logBullet, logSuccess, logWarning } from "../../../utils";
import {
  apphostingOrigin,
  artifactRegistryDomain,
  cloudRunApiOrigin,
  cloudbuildOrigin,
  secretManagerOrigin,
} from "../../../api";
import {
  Backend,
  BackendOutputOnlyFields,
  API_VERSION,
  Build,
  Rollout,
} from "../../../gcp/apphosting";
import { addServiceAccountToRoles } from "../../../gcp/resourceManager";
import * as iam from "../../../gcp/iam";
import { Repository } from "../../../gcp/cloudbuild";
import * as secretManager from "../../../gcp/secretManager";
import { FirebaseError } from "../../../error";
import { promptOnce } from "../../../prompt";
import { DEFAULT_REGION } from "./constants";
import { ensure } from "../../../ensureApiEnabled";
import * as deploymentTool from "../../../deploymentTool";
import { DeepOmit } from "../../../metaprogramming";

const DEFAULT_COMPUTE_SERVICE_ACCOUNT_NAME = "firebase-app-hosting-compute";

const apphostingPollerOptions: Omit<poller.OperationPollerOptions, "operationResourceName"> = {
  apiOrigin: apphostingOrigin(),
  apiVersion: API_VERSION,
  masterTimeout: 25 * 60 * 1_000,
  maxBackoff: 10_000,
};

/**
 * Set up a new App Hosting backend.
 */
export async function doSetup(
  projectId: string,
  location: string | null,
  serviceAccount: string | null,
): Promise<void> {
  await Promise.all([
    ensure(projectId, cloudbuildOrigin(), "apphosting", true),
    ensure(projectId, secretManagerOrigin(), "apphosting", true),
    ensure(projectId, cloudRunApiOrigin(), "apphosting", true),
    ensure(projectId, artifactRegistryDomain(), "apphosting", true),
  ]);

  const allowedLocations = (await apphosting.listLocations(projectId)).map((loc) => loc.locationId);

  if (location) {
    if (!allowedLocations.includes(location)) {
      throw new FirebaseError(
        `Invalid location ${location}. Valid choices are ${allowedLocations.join(", ")}`,
      );
    }
  }

  logBullet("First we need a few details to create your backend.");

  location =
    location ||
    ((await promptOnce({
      name: "region",
      type: "list",
      default: DEFAULT_REGION,
      message:
        "Please select a region " +
        `(${clc.yellow("info")}: Your region determines where your backend is located):\n`,
      choices: allowedLocations.map((loc) => ({ value: loc })),
    })) as string);

  logSuccess(`Region set to ${location}.\n`);

  const backendId = await promptNewBackendId(projectId, location, {
    name: "backendId",
    type: "input",
    default: "my-web-app",
    message: "Create a name for your backend [1-30 characters]",
  });

  const cloudBuildConnRepo = await repo.linkGitHubRepository(projectId, location);

  const backend = await createBackend(
    projectId,
    location,
    backendId,
    cloudBuildConnRepo,
    serviceAccount,
  );

  // TODO: Once tag patterns are implemented, prompt which method the user
  // prefers. We could reduce the number of questions asked by letting people
  // enter tag:<pattern>?
  const branch = await promptOnce({
    name: "branch",
    type: "input",
    default: "main",
    message: "Pick a branch for continuous deployment",
  });

  await setDefaultTrafficPolicy(projectId, location, backendId, branch);

  const confirmRollout = await promptOnce({
    type: "confirm",
    name: "rollout",
    default: true,
    message: "Do you want to deploy now?",
  });

  if (!confirmRollout) {
    logSuccess(`Successfully created backend:\n\t${backend.name}`);
    logSuccess(`Your site will be deployed at:\n\thttps://${backend.uri}`);
    return;
  }

  await orchestrateRollout(projectId, location, backendId, {
    source: {
      codebase: {
        branch,
      },
    },
  });

  logSuccess(`Successfully created backend:\n\t${backend.name}`);
  logSuccess(`Your site is now deployed at:\n\thttps://${backend.uri}`);
}

/**
 * Prompts the user for a backend id and verifies that it doesn't match a pre-existing backend.
 */
async function promptNewBackendId(
  projectId: string,
  location: string,
  prompt: any,
): Promise<string> {
  while (true) {
    const backendId = await promptOnce(prompt);
    try {
      await apphosting.getBackend(projectId, location, backendId);
    } catch (err: any) {
      if (err.status === 404) {
        return backendId;
      }
      throw new FirebaseError(
        `Failed to check if backend with id ${backendId} already exists in ${location}`,
        { original: err },
      );
    }
    logWarning(`Backend with id ${backendId} already exists in ${location}`);
  }
}

function defaultComputeServiceAccountEmail(projectId: string): string {
  return `${DEFAULT_COMPUTE_SERVICE_ACCOUNT_NAME}@${projectId}.iam.gserviceaccount.com`;
}

function defaultCloudBuildServiceAccount(projectNumber: string): string {
  return `${projectNumber}@cloudbuild.gserviceaccount.com`;
}

function defaultComputeEngineServiceAccount(projectNumber: string): string {
  return `${projectNumber}-compute@developer.gserviceaccount.com`;
}

function fetchServiceAccounts(projectNumber: string): {
  buildServiceAccount: string;
  runServiceAccount: string;
} {
  // TODO: For now we will always return the default CBSA and CESA. When the getBackend call supports returning
  // the attached service account in a given backend/location then return that value instead.
  // Sample Call: await apphosting.getBackend(projectId, location, backendId); & make this function async
  return {
    buildServiceAccount: defaultCloudBuildServiceAccount(projectNumber),
    runServiceAccount: defaultComputeEngineServiceAccount(projectNumber),
  };
}

/**
 * Grants the corresponding service accounts the necessary access permissions to the provided secret.
 */
export async function grantSecretAccess(
  secretName: string,
  location: string,
  backendId: string,
  projectId: string,
  projectNumber: string,
): Promise<void> {
  const isExist = await secretManager.secretExists(projectId, secretName);
  if (!isExist) {
    throw new FirebaseError(`Secret ${secretName} does not exist in project ${projectId}`);
  }

  let serviceAccounts = { buildServiceAccount: "", runServiceAccount: "" };
  try {
    serviceAccounts = fetchServiceAccounts(projectNumber);
  } catch (err: any) {
    throw new FirebaseError(
      `Failed to get backend ${backendId} at location ${location}. Please check the parameters you have provided.`,
      { original: err },
    );
  }

  const secret: secretManager.Secret = {
    projectId: projectId,
    name: secretName,
  };

  const bindings: iam.Binding[] = [
    {
      role: "roles/secretmanager.secretAccessor",
      members: [
        `serviceAccount:${serviceAccounts.buildServiceAccount}`,
        `serviceAccount:${serviceAccounts.runServiceAccount}`,
      ],
    },
    {
      role: "roles/secretmanager.viewer",
      members: [`serviceAccount:${serviceAccounts.buildServiceAccount}`],
    },
  ];

  try {
    await secretManager.setIamPolicy(secret, bindings);
  } catch (err: any) {
    throw new FirebaseError(
      `Failed to set IAM bindings ${JSON.stringify(bindings)} on secret: ${secret.name}. Ensure you have the permissions to do so and try again.`,
      { original: err },
    );
  }

  logSuccess(`Successfully set IAM bindings on secret ${secret.name}.\n`);
}

/**
 * Creates (and waits for) a new backend. Optionally may create the default compute service account if
 * it was requested and doesn't exist.
 */
export async function createBackend(
  projectId: string,
  location: string,
  backendId: string,
  repository: Repository,
  serviceAccount: string | null,
): Promise<Backend> {
  const defaultServiceAccount = defaultComputeServiceAccountEmail(projectId);
  const backendReqBody: Omit<Backend, BackendOutputOnlyFields> = {
    servingLocality: "GLOBAL_ACCESS",
    codebase: {
      repository: `${repository.name}`,
      rootDirectory: "/",
    },
    labels: deploymentTool.labels(),
    computeServiceAccount: serviceAccount || defaultServiceAccount,
  };

  // TODO: remove computeServiceAccount when the backend supports the field.
  delete backendReqBody.computeServiceAccount;

  async function createBackendAndPoll() {
    const op = await apphosting.createBackend(projectId, location, backendReqBody, backendId);
    return await poller.pollOperation<Backend>({
      ...apphostingPollerOptions,
      pollerName: `create-${projectId}-${location}-${backendId}`,
      operationResourceName: op.name,
    });
  }

  try {
    return await createBackendAndPoll();
  } catch (err: any) {
    if (err.status === 403) {
      if (err.message.includes(defaultServiceAccount)) {
        // Create the default service account if it doesn't exist and try again.
        await provisionDefaultComputeServiceAccount(projectId);
        return await createBackendAndPoll();
      } else if (serviceAccount && err.message.includes(serviceAccount)) {
        throw new FirebaseError(
          `Failed to create backend due to missing delegation permissions for ${serviceAccount}. Make sure you have the iam.serviceAccounts.actAs permission.`,
          { children: [err] },
        );
      }
    }
    throw err;
  }
}

async function provisionDefaultComputeServiceAccount(projectId: string): Promise<void> {
  try {
    await iam.createServiceAccount(
      projectId,
      DEFAULT_COMPUTE_SERVICE_ACCOUNT_NAME,
      "Firebase App Hosting compute service account",
      "Default service account used to run builds and deploys for Firebase App Hosting",
    );
  } catch (err: any) {
    // 409 Already Exists errors can safely be ignored.
    if (err.status !== 409) {
      throw err;
    }
  }
  await addServiceAccountToRoles(
    projectId,
    defaultComputeServiceAccountEmail(projectId),
    [
      // TODO: Update to roles/firebaseapphosting.computeRunner when it is available.
      "roles/firebaseapphosting.viewer",
      "roles/artifactregistry.createOnPushWriter",
      "roles/logging.logWriter",
      "roles/storage.objectAdmin",
      "roles/firebase.sdkAdminServiceAgent",
    ],
    /* skipAccountLookup= */ true,
  );
}

/**
 * Sets the default rollout policy to route 100% of traffic to the latest deploy.
 */
export async function setDefaultTrafficPolicy(
  projectId: string,
  location: string,
  backendId: string,
  codebaseBranch: string,
): Promise<void> {
  const traffic: DeepOmit<apphosting.Traffic, apphosting.TrafficOutputOnlyFields | "name"> = {
    rolloutPolicy: {
      codebaseBranch: codebaseBranch,
      stages: [
        {
          progression: "IMMEDIATE",
          targetPercent: 100,
        },
      ],
    },
  };
  const op = await apphosting.updateTraffic(projectId, location, backendId, traffic);
  await poller.pollOperation<apphosting.Traffic>({
    ...apphostingPollerOptions,
    pollerName: `updateTraffic-${projectId}-${location}-${backendId}`,
    operationResourceName: op.name,
  });
}

/**
 * Creates a new build and rollout and polls both to completion.
 */
export async function orchestrateRollout(
  projectId: string,
  location: string,
  backendId: string,
  buildInput: DeepOmit<Build, apphosting.BuildOutputOnlyFields | "name">,
): Promise<{ rollout: Rollout; build: Build }> {
  logBullet("Starting a new rollout... this may take a few minutes.");
  const buildId = await apphosting.getNextRolloutId(projectId, location, backendId, 1);
  const buildOp = await apphosting.createBuild(projectId, location, backendId, buildId, buildInput);

  const rolloutBody = {
    build: `projects/${projectId}/locations/${location}/backends/${backendId}/builds/${buildId}`,
  };

  let tries = 0;
  let done = false;
  while (!done) {
    tries++;
    try {
      const validateOnly = true;
      await apphosting.createRollout(
        projectId,
        location,
        backendId,
        buildId,
        rolloutBody,
        validateOnly,
      );
      done = true;
    } catch (err: unknown) {
      if (err instanceof FirebaseError && err.status === 400) {
        if (tries >= 5) {
          throw err;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } else {
        throw err;
      }
    }
  }

  const rolloutOp = await apphosting.createRollout(
    projectId,
    location,
    backendId,
    buildId,
    rolloutBody,
  );

  const rolloutPoll = poller.pollOperation<Rollout>({
    ...apphostingPollerOptions,
    pollerName: `create-${projectId}-${location}-backend-${backendId}-rollout-${buildId}`,
    operationResourceName: rolloutOp.name,
  });
  const buildPoll = poller.pollOperation<Build>({
    ...apphostingPollerOptions,
    pollerName: `create-${projectId}-${location}-backend-${backendId}-build-${buildId}`,
    operationResourceName: buildOp.name,
  });

  const [rollout, build] = await Promise.all([rolloutPoll, buildPoll]);
  logSuccess("Rollout completed.");

  if (build.state !== "READY") {
    if (!build.buildLogsUri) {
      throw new FirebaseError(
        "Failed to build your app, but failed to get build logs as well. " +
          "This is an internal error and should be reported",
      );
    }
    throw new FirebaseError(
      `Failed to build your app. Please inspect the build logs at ${build.buildLogsUri}.`,
      { children: [build.error] },
    );
  }
  return { rollout, build };
}
