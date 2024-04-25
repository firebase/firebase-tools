import * as repo from "./repo";
import * as poller from "../operation-poller";
import * as apphosting from "../gcp/apphosting";
import * as githubConnections from "./githubConnections";
import { logBullet, logSuccess, logWarning } from "../utils";
import {
  apphostingOrigin,
  artifactRegistryDomain,
  cloudRunApiOrigin,
  cloudbuildOrigin,
  developerConnectOrigin,
  iamOrigin,
  secretManagerOrigin,
} from "../api";
import { Backend, BackendOutputOnlyFields, API_VERSION, Build, Rollout } from "../gcp/apphosting";
import { addServiceAccountToRoles } from "../gcp/resourceManager";
import * as iam from "../gcp/iam";
import { Repository } from "../gcp/cloudbuild";
import { FirebaseError } from "../error";
import { promptOnce } from "../prompt";
import { DEFAULT_LOCATION } from "./constants";
import { ensure } from "../ensureApiEnabled";
import * as deploymentTool from "../deploymentTool";
import { DeepOmit } from "../metaprogramming";
import * as apps from "./app";
import { GitRepositoryLink } from "../gcp/devConnect";
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
  webAppName: string | null,
  location: string | null,
  serviceAccount: string | null,
  withDevConnect: boolean,
): Promise<void> {
  await Promise.all([
    ...(withDevConnect ? [ensure(projectId, developerConnectOrigin(), "apphosting", true)] : []),
    ensure(projectId, cloudbuildOrigin(), "apphosting", true),
    ensure(projectId, secretManagerOrigin(), "apphosting", true),
    ensure(projectId, cloudRunApiOrigin(), "apphosting", true),
    ensure(projectId, artifactRegistryDomain(), "apphosting", true),
    ensure(projectId, iamOrigin(), "apphosting", true),
  ]);
  logBullet("First we need a few details to create your backend.\n");

  // Hack: Because IAM can take ~45 seconds to propagate, we provision the service account as soon as
  // possible to reduce the likelihood that the subsequent Cloud Build fails. See b/336862200.
  await ensureAppHostingComputeServiceAccount(projectId, serviceAccount);

  const allowedLocations = (await apphosting.listLocations(projectId)).map((loc) => loc.locationId);
  if (location) {
    if (!allowedLocations.includes(location)) {
      throw new FirebaseError(
        `Invalid location ${location}. Valid choices are ${allowedLocations.join(", ")}`,
      );
    }
  }

  location =
    location || (await promptLocation(projectId, "Select a location to host your backend:\n"));
  logSuccess(`Location set to ${location}.\n`);

  const backendId = await promptNewBackendId(projectId, location, {
    name: "backendId",
    type: "input",
    default: "my-web-app",
    message: "Create a name for your backend [1-30 characters]",
  });

  const webApp = await apps.getOrCreateWebApp(projectId, webAppName, backendId);
  if (webApp) {
    logSuccess(`Firebase web app set to ${webApp.name}.\n`);
  } else {
    logWarning(`Firebase web app not set`);
  }

  const gitRepositoryConnection: Repository | GitRepositoryLink = withDevConnect
    ? await githubConnections.linkGitHubRepository(projectId, location)
    : await repo.linkGitHubRepository(projectId, location);

  const rootDir = await promptOnce({
    name: "rootDir",
    type: "input",
    default: "/",
    message: "Specify your app's root directory relative to your repository",
  });

  const backend = await createBackend(
    projectId,
    location,
    backendId,
    gitRepositoryConnection,
    serviceAccount,
    webApp?.id,
    rootDir,
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
    logSuccess(`Your backend will be deployed at:\n\thttps://${backend.uri}`);
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
  logSuccess(`Your backend is now deployed at:\n\thttps://${backend.uri}`);
}

/**
 * Ensures the service account is present the user has permissions to use it by
 * checking the `iam.serviceAccounts.actAs` permission. If the permissions
 * check fails, this returns an error. If the permission check fails with a
 * "not found" error, this attempts to provision the service account.
 */
export async function ensureAppHostingComputeServiceAccount(
  projectId: string,
  serviceAccount: string | null,
): Promise<void> {
  const sa = serviceAccount || defaultComputeServiceAccountEmail(projectId);
  const name = `projects/${projectId}/serviceAccounts/${sa}`;
  try {
    await iam.testResourceIamPermissions(
      iamOrigin(),
      "v1",
      name,
      ["iam.serviceAccounts.actAs"],
      `projects/${projectId}`,
    );
  } catch (err: unknown) {
    if (!(err instanceof FirebaseError)) {
      throw err;
    }
    if (err.status === 404) {
      await provisionDefaultComputeServiceAccount(projectId);
    } else if (err.status === 403) {
      throw new FirebaseError(
        `Failed to create backend due to missing delegation permissions for ${sa}. Make sure you have the iam.serviceAccounts.actAs permission.`,
        { original: err },
      );
    }
  }
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

/**
 * Creates (and waits for) a new backend. Optionally may create the default compute service account if
 * it was requested and doesn't exist.
 */
export async function createBackend(
  projectId: string,
  location: string,
  backendId: string,
  repository: Repository | GitRepositoryLink,
  serviceAccount: string | null,
  webAppId: string | undefined,
  rootDir = "/",
): Promise<Backend> {
  const defaultServiceAccount = defaultComputeServiceAccountEmail(projectId);
  const backendReqBody: Omit<Backend, BackendOutputOnlyFields> = {
    servingLocality: "GLOBAL_ACCESS",
    codebase: {
      repository: `${repository.name}`,
      rootDirectory: rootDir,
    },
    labels: deploymentTool.labels(),
    serviceAccount: serviceAccount || defaultServiceAccount,
    appId: webAppId,
  };

  async function createBackendAndPoll(): Promise<apphosting.Backend> {
    const op = await apphosting.createBackend(projectId, location, backendReqBody, backendId);
    return await poller.pollOperation<Backend>({
      ...apphostingPollerOptions,
      pollerName: `create-${projectId}-${location}-${backendId}`,
      operationResourceName: op.name,
    });
  }

  return await createBackendAndPoll();
}

async function provisionDefaultComputeServiceAccount(projectId: string): Promise<void> {
  try {
    await iam.createServiceAccount(
      projectId,
      DEFAULT_COMPUTE_SERVICE_ACCOUNT_NAME,
      "Default service account used to run builds and deploys for Firebase App Hosting",
      "Firebase App Hosting compute service account",
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
      "roles/firebaseapphosting.computeRunner",
      "roles/firebase.sdkAdminServiceAgent",
      "roles/developerconnect.tokenAccessor",
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

function delay(ms: number): Promise<number> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  await delay(45 * 1000);
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

/**
 * Deletes the given backend. Polls till completion.
 */
export async function deleteBackendAndPoll(
  projectId: string,
  location: string,
  backendId: string,
): Promise<void> {
  const op = await apphosting.deleteBackend(projectId, location, backendId);
  await poller.pollOperation<void>({
    ...apphostingPollerOptions,
    pollerName: `delete-${projectId}-${location}-${backendId}`,
    operationResourceName: op.name,
  });
}

/**
 * Prompts the user for a location.
 */
export async function promptLocation(
  projectId: string,
  prompt = "Please select a location:",
): Promise<string> {
  const allowedLocations = (await apphosting.listLocations(projectId)).map((loc) => loc.locationId);

  return (await promptOnce({
    name: "location",
    type: "list",
    default: DEFAULT_LOCATION,
    message: prompt,
    choices: allowedLocations,
  })) as string;
}
