import * as clc from "colorette";
import * as poller from "../operation-poller";
import * as apphosting from "../gcp/apphosting";
import * as githubConnections from "./githubConnections";
import { logBullet, logSuccess, logWarning, sleep } from "../utils";
import {
  apphostingOrigin,
  artifactRegistryDomain,
  cloudRunApiOrigin,
  cloudbuildOrigin,
  consoleOrigin,
  developerConnectOrigin,
  iamOrigin,
  secretManagerOrigin,
} from "../api";
import { Backend, BackendOutputOnlyFields, API_VERSION } from "../gcp/apphosting";
import { addServiceAccountToRoles } from "../gcp/resourceManager";
import * as iam from "../gcp/iam";
import { FirebaseError, getErrStatus, getError } from "../error";
import { promptOnce } from "../prompt";
import { DEFAULT_LOCATION } from "./constants";
import { ensure } from "../ensureApiEnabled";
import * as deploymentTool from "../deploymentTool";
import { DeepOmit } from "../metaprogramming";
import { webApps } from "./app";
import { GitRepositoryLink } from "../gcp/devConnect";
import * as ora from "ora";
import fetch from "node-fetch";
import { orchestrateRollout } from "./rollout";

const DEFAULT_COMPUTE_SERVICE_ACCOUNT_NAME = "firebase-app-hosting-compute";

const apphostingPollerOptions: Omit<poller.OperationPollerOptions, "operationResourceName"> = {
  apiOrigin: apphostingOrigin(),
  apiVersion: API_VERSION,
  masterTimeout: 25 * 60 * 1_000,
  maxBackoff: 10_000,
};

async function tlsReady(url: string): Promise<boolean> {
  // Note, we do not use the helper libraries because they impose additional logic on content type and parsing.
  try {
    await fetch(url);
    return true;
  } catch (err) {
    // At the time of this writing, the error code is ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE.
    // I've chosen to use a regexp in an attempt to be forwards compatible with new versions of
    // SSL.
    const maybeNodeError = err as { cause: { code: string }; code: string };
    if (
      /HANDSHAKE_FAILURE/.test(maybeNodeError?.cause?.code) ||
      "EPROTO" === maybeNodeError?.code
    ) {
      return false;
    }
    return true;
  }
}

async function awaitTlsReady(url: string): Promise<void> {
  let ready;
  do {
    ready = await tlsReady(url);
    if (!ready) {
      await sleep(1000 /* ms */);
    }
  } while (!ready);
}

/**
 * Set up a new App Hosting backend.
 */
export async function doSetup(
  projectId: string,
  webAppName: string | null,
  serviceAccount: string | null,
): Promise<void> {
  await Promise.all([
    ensure(projectId, developerConnectOrigin(), "apphosting", true),
    ensure(projectId, cloudbuildOrigin(), "apphosting", true),
    ensure(projectId, secretManagerOrigin(), "apphosting", true),
    ensure(projectId, cloudRunApiOrigin(), "apphosting", true),
    ensure(projectId, artifactRegistryDomain(), "apphosting", true),
    ensure(projectId, iamOrigin(), "apphosting", true),
  ]);

  // Hack: Because IAM can take ~45 seconds to propagate, we provision the service account as soon as
  // possible to reduce the likelihood that the subsequent Cloud Build fails. See b/336862200.
  await ensureAppHostingComputeServiceAccount(projectId, serviceAccount);

  // TODO(https://github.com/firebase/firebase-tools/issues/8283): The "primary region"
  // is still "locations" in the V1 API. This will change in the V2 API and we may need to update
  // the variables and API methods we're calling under the hood when fetching "primary region".
  const location = await promptLocation(
    projectId,
    "Select a primary region to host your backend:\n",
  );

  const gitRepositoryLink: GitRepositoryLink = await githubConnections.linkGitHubRepository(
    projectId,
    location,
  );

  const rootDir = await promptOnce({
    name: "rootDir",
    type: "input",
    default: "/",
    message: "Specify your app's root directory relative to your repository",
  });

  // TODO: Once tag patterns are implemented, prompt which method the user
  // prefers. We could reduce the number of questions asked by letting people
  // enter tag:<pattern>?
  const branch = await githubConnections.promptGitHubBranch(gitRepositoryLink);
  logSuccess(`Repo linked successfully!\n`);

  logBullet(`${clc.yellow("===")} Set up your backend`);
  const backendId = await promptNewBackendId(projectId, location, {
    name: "backendId",
    type: "input",
    default: "my-web-app",
    message: "Provide a name for your backend [1-30 characters]",
  });
  logSuccess(`Name set to ${backendId}\n`);

  const webApp = await webApps.getOrCreateWebApp(projectId, webAppName, backendId);
  if (!webApp) {
    logWarning(`Firebase web app not set`);
  }

  const createBackendSpinner = ora("Creating your new backend...").start();
  const backend = await createBackend(
    projectId,
    location,
    backendId,
    gitRepositoryLink,
    serviceAccount,
    webApp?.id,
    rootDir,
  );
  createBackendSpinner.succeed(`Successfully created backend!\n\t${backend.name}\n`);

  await setDefaultTrafficPolicy(projectId, location, backendId, branch);

  const confirmRollout = await promptOnce({
    type: "confirm",
    name: "rollout",
    default: true,
    message: "Do you want to deploy now?",
  });

  if (!confirmRollout) {
    logSuccess(`Your backend will be deployed at:\n\thttps://${backend.uri}`);
    return;
  }

  const url = `https://${backend.uri}`;
  logBullet(
    `You may also track this rollout at:\n\t${consoleOrigin()}/project/${projectId}/apphosting`,
  );
  // TODO: Previous versions of this command printed the URL before the rollout started so that
  // if a user does exit they will know where to go later. Should this be re-added?
  const createRolloutSpinner = ora(
    "Starting a new rollout; this may take a few minutes. It's safe to exit now.",
  ).start();
  await orchestrateRollout({
    projectId,
    location,
    backendId,
    buildInput: {
      source: {
        codebase: {
          branch,
        },
      },
    },
    isFirstRollout: true,
  });
  createRolloutSpinner.succeed("Rollout complete");
  if (!(await tlsReady(url))) {
    const tlsSpinner = ora(
      "Finalizing your backend's TLS certificate; this may take a few minutes.",
    ).start();
    await awaitTlsReady(url);
    tlsSpinner.succeed("TLS certificate ready");
  }
  logSuccess(`Your backend is now deployed at:\n\thttps://${backend.uri}`);
}

/**
 * Set up a new App Hosting-type Developer Connect GitRepoLink, optionally with a specific connection ID
 */
export async function createGitRepoLink(
  projectId: string,
  location: string | null,
  connectionId?: string,
): Promise<void> {
  await Promise.all([
    ensure(projectId, developerConnectOrigin(), "apphosting", true),
    ensure(projectId, secretManagerOrigin(), "apphosting", true),
    ensure(projectId, iamOrigin(), "apphosting", true),
  ]);

  const allowedLocations = (await apphosting.listLocations(projectId)).map((loc) => loc.locationId);
  if (location) {
    if (!allowedLocations.includes(location)) {
      throw new FirebaseError(
        `Invalid location ${location}. Valid choices are ${allowedLocations.join(", ")}`,
      );
    }
  }

  location =
    location ||
    (await promptLocation(projectId, "Select a location for your GitRepoLink's connection:\n"));

  await githubConnections.linkGitHubRepository(projectId, location, connectionId);
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
    } catch (err: unknown) {
      if (getErrStatus(err) === 404) {
        return backendId;
      }
      throw new FirebaseError(
        `Failed to check if backend with id ${backendId} already exists in ${location}`,
        { original: getError(err) },
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
  repository: GitRepositoryLink,
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
  } catch (err: unknown) {
    // 409 Already Exists errors can safely be ignored.
    if (getErrStatus(err) !== 409) {
      throw err;
    }
  }
  await addServiceAccountToRoles(
    projectId,
    defaultComputeServiceAccountEmail(projectId),
    [
      "roles/firebaseapphosting.computeRunner",
      "roles/firebase.sdkAdminServiceAgent",
      "roles/developerconnect.readTokenAccessor",
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
 * Prompts the user for a location. If there's only a single valid location, skips the prompt and returns that location.
 */
export async function promptLocation(
  projectId: string,
  prompt = "Please select a location:",
): Promise<string> {
  const allowedLocations = (await apphosting.listLocations(projectId)).map((loc) => loc.locationId);
  if (allowedLocations.length === 1) {
    return allowedLocations[0];
  }

  const location = (await promptOnce({
    name: "location",
    type: "list",
    default: DEFAULT_LOCATION,
    message: prompt,
    choices: allowedLocations,
  })) as string;

  logSuccess(`Location set to ${location}.\n`);

  return location;
}

/**
 * Fetches a backend from the server in the specified region (location).
 */
export async function getBackendForLocation(
  projectId: string,
  location: string,
  backendId: string,
): Promise<apphosting.Backend> {
  try {
    return await apphosting.getBackend(projectId, location, backendId);
  } catch (err: unknown) {
    throw new FirebaseError(`No backend named "${backendId}" found in ${location}.`, {
      original: getError(err),
    });
  }
}

/**
 * Fetches backends of the given backendId and lets the user choose if more than one is found.
 */
export async function chooseBackends(
  projectId: string,
  backendId: string,
  chooseBackendPrompt: string,
  force?: boolean,
): Promise<apphosting.Backend[]> {
  let { unreachable, backends } = await apphosting.listBackends(projectId, "-");
  if (unreachable && unreachable.length !== 0) {
    logWarning(
      `The following locations are currently unreachable: ${unreachable.join(",")}.\n` +
        "If your backend is in one of these regions, please try again later.",
    );
  }
  backends = backends.filter(
    (backend) => apphosting.parseBackendName(backend.name).id === backendId,
  );
  if (backends.length === 0) {
    throw new FirebaseError(`No backend named "${backendId}" found.`);
  }
  if (backends.length === 1) {
    return backends;
  }

  if (force) {
    throw new FirebaseError(
      `Force cannot be used because multiple backends were found with ID ${backendId}.`,
    );
  }
  const backendsByDisplay = new Map<string, apphosting.Backend>();
  backends.forEach((backend) => {
    const { location, id } = apphosting.parseBackendName(backend.name);
    backendsByDisplay.set(`${id}(${location})`, backend);
  });
  const chosenBackendDisplays = await promptOnce({
    name: "backend",
    type: "checkbox",
    message: chooseBackendPrompt,
    choices: Array.from(backendsByDisplay.keys(), (name) => {
      return {
        checked: false,
        name: name,
        value: name,
      };
    }),
  });
  const chosenBackends: apphosting.Backend[] = [];
  chosenBackendDisplays.forEach((backendDisplay) => {
    const backend = backendsByDisplay.get(backendDisplay);
    if (backend !== undefined) {
      chosenBackends.push(backend);
    }
  });
  return chosenBackends;
}

/**
 * Fetches a backend from the server. If there are multiple backends with that name (ie multi-regional backends),
 * prompts the user to disambiguate. If the force option is specified and multiple backends have the same name,
 * it throws an error.
 */
export async function getBackendForAmbiguousLocation(
  projectId: string,
  backendId: string,
  locationDisambugationPrompt: string,
  force?: boolean,
): Promise<apphosting.Backend> {
  let { unreachable, backends } = await apphosting.listBackends(projectId, "-");
  if (unreachable && unreachable.length !== 0) {
    logWarning(
      `The following locations are currently unreachable: ${unreachable.join(", ")}.\n` +
        "If your backend is in one of these regions, please try again later.",
    );
  }
  backends = backends.filter(
    (backend) => apphosting.parseBackendName(backend.name).id === backendId,
  );
  if (backends.length === 0) {
    throw new FirebaseError(`No backend named "${backendId}" found.`);
  }
  if (backends.length === 1) {
    return backends[0];
  }
  if (force) {
    throw new FirebaseError(
      `Multiple backends found with ID ${backendId}. Please specify the region of your target backend.`,
    );
  }

  const backendsByLocation = new Map<string, apphosting.Backend>();
  backends.forEach((backend) =>
    backendsByLocation.set(apphosting.parseBackendName(backend.name).location, backend),
  );
  const location = await promptOnce({
    name: "location",
    type: "list",
    message: locationDisambugationPrompt,
    choices: [...backendsByLocation.keys()],
  });
  return backendsByLocation.get(location)!;
}

/**
 * Fetches a backend from the server. If there are multiple backends with the name, it will throw an error
 * telling the user that there are other backends with the same name that need to be deleted.
 */
export async function getBackend(
  projectId: string,
  backendId: string,
): Promise<apphosting.Backend> {
  let { unreachable, backends } = await apphosting.listBackends(projectId, "-");
  backends = backends.filter(
    (backend) => apphosting.parseBackendName(backend.name).id === backendId,
  );
  if (backends.length > 1) {
    const locations = backends.map((b) => apphosting.parseBackendName(b.name).location);
    throw new FirebaseError(
      `You have multiple backends with the same ${backendId} ID in regions: ${locations.join(", ")}. This is not allowed until we can support more locations. ` +
        "Please delete and recreate any backends that share an ID with another backend.",
    );
  }
  if (backends.length === 1) {
    return backends[0];
  }
  if (unreachable && unreachable.length !== 0) {
    logWarning(
      `Backends with the following primary regions are unreachable: ${unreachable.join(", ")}.\n` +
        "If your backend is in one of these regions, please try again later.",
    );
  }
  throw new FirebaseError(`No backend named ${backendId} found.`);
}
