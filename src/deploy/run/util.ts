import * as clc from "colorette";
import { FirebaseError, getErrStatus } from "../../error";
import { RunSingle } from "../../firebaseConfig";
import * as runv2 from "../../gcp/runv2";
import { Options } from "../../options";
import { logLabeledBullet } from "../../utils";

/**
 * Returns every Cloud Run service in firebase.json. Throws if one has no region or is listed twice.
 */
export function getAllServiceConfigs(options: Options): RunSingle[] {
  // "run" can be one service or a list of them.
  const configs: RunSingle[] = [options.config?.src?.run ?? []].flat();
  const names = new Set<string>();
  for (const config of configs) {
    if (!config.region) {
      throw new FirebaseError(
        `Cloud Run service ${config.serviceId} is missing a region in firebase.json.`,
      );
    }
    const name = fullServiceName(config);
    if (names.has(name)) {
      throw new FirebaseError(
        `Cloud Run service ${name} is listed more than once in firebase.json.`,
      );
    }
    names.add(name);
  }
  return configs;
}

/**
 * Returns the services in firebase.json that --only selects: all of them for "run" (or no --only),
 * a service ID in every region it's listed in for "run:<serviceId>", and one service for
 * "run:<serviceId>:<region>".
 */
export function getServiceConfigs(options: Options): RunSingle[] {
  const configs = getAllServiceConfigs(options);
  const filters = options.only ? options.only.split(",") : ["run"];
  if (filters.includes("run")) {
    return configs;
  }
  const selected = filters
    .filter((f) => f.startsWith("run:"))
    .flatMap((filter) => {
      const name = filter.slice("run:".length);
      const matches = findServices(configs, name);
      if (!matches.length) {
        throw new FirebaseError(`Cloud Run service ${name} not detected in firebase.json.`);
      }
      if (matches.length > 1) {
        logLabeledBullet(
          "run",
          `${filter} matches ${matches.length} services in firebase.json: ` +
            `${matches.map(fullServiceName).join(", ")}. Deploying all of them. ` +
            `To deploy just one, use --only ${filter}:<region>.`,
        );
      }
      return matches;
    });
  // Keep firebase.json's order, and list each service once even if several filters match it.
  return configs.filter((c) => selected.includes(c));
}

/**
 * Returns the services that `name` refers to. "<serviceId>" matches that service ID in every
 * region, and "<serviceId>:<region>" matches one service. Throws if `name` has any other form.
 */
export function findServices(configs: RunSingle[], name: string): RunSingle[] {
  const [serviceId, region, ...rest] = name.split(":");
  if (!serviceId || region === "" || rest.length) {
    throw new FirebaseError(
      `Invalid Cloud Run service "${name}". Use <serviceId> or <serviceId>:<region>.`,
    );
  }
  return configs.filter((c) => c.serviceId === serviceId && (!region || c.region === region));
}

/**
 * Returns the name that picks out exactly one service, like my-service:us-central1. Service IDs
 * are only unique within a region.
 */
export function fullServiceName(config: RunSingle): string {
  return `${config.serviceId}:${config.region}`;
}

/**
 * Gets a Cloud Run service, or undefined if it doesn't exist yet.
 */
export async function getExistingService(
  projectId: string,
  region: string,
  serviceId: string,
): Promise<runv2.Service | undefined> {
  try {
    return await runv2.getService(projectId, region, serviceId);
  } catch (err: unknown) {
    if (getErrStatus(err) === 404) {
      return undefined;
    }
    throw err;
  }
}

/**
 * Explains how to create a service that is in firebase.json, but not in Cloud Run yet.
 */
export function missingServiceMessage(config: RunSingle): string {
  const how = `Create it with ${clc.bold("firebase init run")} or ${clc.bold(`firebase deploy --only run:${fullServiceName(config)}`)}.`;
  return `Cloud Run service ${config.serviceId} doesn't exist in ${config.region} yet. ${how}`;
}
