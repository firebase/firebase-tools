import * as clc from "colorette";
import { deploy } from "..";
import { FirebaseError } from "../../error";
import { RunSingle } from "../../firebaseConfig";
import { Options } from "../../options";
import { needProjectId } from "../../projectUtils";
import { fullServiceName, getAllServiceConfigs, getExistingService } from "./util";

/**
 * Changes a service's settings by deploying it with them, like `firebase deploy` does. It always
 * rebuilds, even if nothing changed: a new base image needs a new build, because images built for
 * a base image leave out the OS and runtime that other images bring.
 * `region` is only needed if firebase.json lists the service ID in more than one region.
 */
export async function updateService(
  serviceId: string,
  region: string | undefined,
  options: Options,
): Promise<void> {
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
  const config = findServiceToUpdate(serviceId, region, options);
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
 * Returns the service in firebase.json with this ID, in `region` if one is given. Updates change
 * one service at a time, so if firebase.json lists the ID in more than one region, `region` is
 * required.
 */
function findServiceToUpdate(
  serviceId: string,
  region: string | undefined,
  options: Options,
): RunSingle {
  const matches = getAllServiceConfigs(options).filter(
    (c) => c.serviceId === serviceId && (!region || c.region === region),
  );
  if (!matches.length) {
    const service = region ? `${serviceId} in ${region}` : serviceId;
    throw new FirebaseError(`Cloud Run service ${service} not detected in firebase.json.`);
  }
  if (matches.length > 1) {
    const regions = matches.map((c) => c.region);
    const example = `firebase run:services:update ${serviceId} --region ${regions[0]}`;
    throw new FirebaseError(
      `firebase.json lists ${serviceId} in ${regions.length} regions: ${regions.join(", ")}. ` +
        `Pick one with --region, e.g. ${example}`,
    );
  }
  return matches[0];
}
