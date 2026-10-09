import * as clc from "colorette";
import { deploy } from "..";
import { FirebaseError } from "../../error";
import { RunSingle } from "../../firebaseConfig";
import { Options } from "../../options";
import { needProjectId } from "../../projectUtils";
import { findServices, fullServiceName, getAllServiceConfigs, getExistingService } from "./util";

/**
 * Changes a service's settings by deploying it with them, like `firebase deploy` does. It always
 * rebuilds, even if nothing changed: a new base image needs a new build, because images built for
 * a base image leave out the OS and runtime that other images bring.
 * `name` is <serviceId>, or <serviceId>:<region> if firebase.json lists the ID in several regions.
 */
export async function updateService(name: string, options: Options): Promise<void> {
  // Deploy reads each setting as an override: a value sets it, null clears it, and undefined keeps
  // the service's current value.
  const settings = {
    baseImage: readFlagPair(options.baseImage, options.clearBaseImage, "base-image"),
    appId: readFlagPair(options.app, options.clearApp, "app"),
  };
  if (Object.values(settings).every((value) => value === undefined)) {
    throw new FirebaseError(
      "Specify a setting to update: --base-image <baseImage>, --clear-base-image, --app <appId>, or --clear-app.",
    );
  }

  const projectId = needProjectId(options);
  const config = findServiceToUpdate(name, options);
  if (settings.baseImage === null && config.localBuild) {
    throw new FirebaseError(
      `Cannot clear the base image of ${config.serviceId}: local builds need one.`,
    );
  }
  if (!(await getExistingService(projectId, config.region, config.serviceId))) {
    // A first deploy can't create a locally built service: it needs the base image that init sets.
    const howToCreate = config.localBuild
      ? clc.bold("firebase init run")
      : `${clc.bold("firebase init run")} or ` +
        clc.bold(`firebase deploy --only run:${fullServiceName(config)}`);
    throw new FirebaseError(
      `Cloud Run service ${config.serviceId} doesn't exist in ${config.region} yet. ` +
        `Create it with ${howToCreate}, then update it.`,
    );
  }

  await deploy(["run"], { ...options, only: `run:${fullServiceName(config)}` }, settings);
}

/** Reads a `--<flag> <value>` / `--clear-<flag>` pair as a setting override. */
function readFlagPair(value: unknown, clear: unknown, flag: string): string | null | undefined {
  if (value && clear) {
    throw new FirebaseError(`Use either --${flag} or --clear-${flag}, not both.`);
  }
  return clear ? null : (value as string | undefined);
}

/**
 * Returns the service in firebase.json that `name` refers to. Updates change one service at a
 * time, so if firebase.json lists the service ID in more than one region, `name` has to include
 * the region.
 */
function findServiceToUpdate(name: string, options: Options): RunSingle {
  const matches = findServices(getAllServiceConfigs(options), name);
  if (!matches.length) {
    throw new FirebaseError(`Cloud Run service ${name} not detected in firebase.json.`);
  }
  if (matches.length > 1) {
    const names = matches.map(fullServiceName);
    throw new FirebaseError(
      `${name} matches ${matches.length} services in firebase.json: ${names.join(", ")}. ` +
        `Run the command again with one of them, e.g. firebase run:services:update ${names[0]}`,
    );
  }
  return matches[0];
}
