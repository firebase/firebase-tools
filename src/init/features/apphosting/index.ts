import * as clc from "colorette";

import * as repo from "./repo";
import * as poller from "../../../operation-poller";
import * as apphosting from "../../../gcp/apphosting";
import { logBullet, logSuccess, logWarning } from "../../../utils";
import { apphostingOrigin } from "../../../api";
import {
  Backend,
  BackendOutputOnlyFields,
  API_VERSION,
  Build,
  Rollout,
} from "../../../gcp/apphosting";
import { Repository } from "../../../gcp/cloudbuild";
import { FirebaseError } from "../../../error";
import { promptOnce } from "../../../prompt";
import { DEFAULT_REGION } from "./constants";
import { ensure } from "../../../ensureApiEnabled";
import * as deploymentTool from "../../../deploymentTool";
import { DeepOmit } from "../../../metaprogramming";

const apphostingPollerOptions: Omit<poller.OperationPollerOptions, "operationResourceName"> = {
  apiOrigin: apphostingOrigin,
  apiVersion: API_VERSION,
  masterTimeout: 25 * 60 * 1_000,
  maxBackoff: 10_000,
};

/**
 * Set up a new App Hosting backend.
 */
export async function doSetup(setup: any, projectId: string): Promise<void> {
  await Promise.all([
    ensure(projectId, "cloudbuild.googleapis.com", "apphosting", true),
    ensure(projectId, "secretmanager.googleapis.com", "apphosting", true),
    ensure(projectId, "run.googleapis.com", "apphosting", true),
    ensure(projectId, "artifactregistry.googleapis.com", "apphosting", true),
  ]);

  const allowedLocations = (await apphosting.listLocations(projectId)).map((loc) => loc.locationId);

  if (setup.location) {
    if (!allowedLocations.includes(setup.location)) {
      throw new FirebaseError(
        `Invalid location ${setup.location}. Valid choices are ${allowedLocations.join(", ")}`,
      );
    }
  }

  logBullet("First we need a few details to create your backend.");

  const location: string = setup.location || (await promptLocation(projectId, allowedLocations));

  logSuccess(`Region set to ${location}.\n`);

  let backendId: string;
  while (true) {
    backendId = await promptOnce({
      name: "backendId",
      type: "input",
      default: "my-web-app",
      message: "Create a name for your backend [1-30 characters]",
    });
    try {
      await apphosting.getBackend(projectId, location, backendId);
    } catch (err: any) {
      if (err.status === 404) {
        break;
      }
      throw new FirebaseError(
        `Failed to check if backend with id ${backendId} already exists in ${location}`,
        { original: err },
      );
    }
    logWarning(`Backend with id ${backendId} already exists in ${location}`);
  }

  const backend = await onboardBackend(projectId, location, backendId);

  // TODO: Once tag patterns are implemented, prompt which method the user
  // prefers. We could reduce the nubmer of questions asked by letting people
  // enter tag:<pattern>?
  const branch = await promptOnce({
    name: "branch",
    type: "input",
    default: "main",
    message: "Pick a branch for continuous deployment",
  });
  const traffic: DeepOmit<apphosting.Traffic, apphosting.TrafficOutputOnlyFields | "name"> = {
    rolloutPolicy: {
      codebaseBranch: branch,
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

  const { build } = await onboardRollout(projectId, location, backendId, {
    source: {
      codebase: {
        branch,
      },
    },
  });

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

  logSuccess(`Successfully created backend:\n\t${backend.name}`);
  logSuccess(`Your site is now deployed at:\n\thttps://${backend.uri}`);
  logSuccess(
    `View the rollout status by running:\n\tfirebase apphosting:backends:get ${backendId} --project ${projectId}`,
  );
}

async function promptLocation(projectId: string, locations: string[]): Promise<string> {
  return (await promptOnce({
    name: "region",
    type: "list",
    default: DEFAULT_REGION,
    message:
      "Please select a region " +
      `(${clc.yellow("info")}: Your region determines where your backend is located):\n`,
    choices: locations.map((loc) => ({ value: loc })),
  })) as string;
}

function toBackend(cloudBuildConnRepo: Repository): DeepOmit<Backend, BackendOutputOnlyFields> {
  return {
    servingLocality: "GLOBAL_ACCESS",
    codebase: {
      repository: `${cloudBuildConnRepo.name}`,
      rootDirectory: "/",
    },
    labels: deploymentTool.labels(),
  };
}

/**
 * Walkthrough the flow for creating a new backend.
 */
export async function onboardBackend(
  projectId: string,
  location: string,
  backendId: string,
): Promise<Backend> {
  const cloudBuildConnRepo = await repo.linkGitHubRepository(projectId, location);
  const backendDetails = toBackend(cloudBuildConnRepo);
  return await createBackend(projectId, location, backendDetails, backendId);
}

/**
 * Creates (and waits for) a new backend.
 */
export async function createBackend(
  projectId: string,
  location: string,
  backendReqBoby: Omit<Backend, BackendOutputOnlyFields>,
  backendId: string,
): Promise<Backend> {
  const op = await apphosting.createBackend(projectId, location, backendReqBoby, backendId);
  const backend = await poller.pollOperation<Backend>({
    ...apphostingPollerOptions,
    pollerName: `create-${projectId}-${location}-${backendId}`,
    operationResourceName: op.name,
  });
  return backend;
}

/**
 * Onboard a new rollout by creating a build and rollout
 */
export async function onboardRollout(
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
      await apphosting.createRollout(projectId, location, backendId, buildId, rolloutBody, true);
      done = true;
    } catch (err: unknown) {
      if (tries >= 5) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
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
  return { rollout, build };
}
