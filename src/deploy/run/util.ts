import * as clc from "colorette";
import { FirebaseError, getErrStatus } from "../../error";
import { AppHostingSingle, RunSingle } from "../../firebaseConfig";
import * as runv2 from "../../gcp/runv2";
import { Options } from "../../options";
import { cloneDeep } from "../../utils";

/** Rolling out a new revision can take longer than the operation poller's default timeout. */
export const SERVICE_OPERATION_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Returns the Cloud Run services in firebase.json that match the --only filter.
 */
export function getServiceConfigs(options: Options): RunSingle[] {
  const run = options.config.src.run;
  const configs = run ? (Array.isArray(run) ? run : [run]) : [];
  const selectors = options.only ? options.only.split(",") : ["run"];
  if (selectors.includes("run")) {
    return configs;
  }
  const serviceIds = selectors.filter((s) => s.startsWith("run:")).map((s) => s.slice(4));
  const missing = serviceIds.filter((id) => !configs.some((c) => c.serviceId === id));
  if (missing.length) {
    throw new FirebaseError(
      `Cloud Run service IDs ${missing.join(",")} not detected in firebase.json`,
    );
  }
  return configs.filter((c) => serviceIds.includes(c.serviceId));
}

/**
 * Adapts a Cloud Run config so that it can reuse App Hosting's local build and archive helpers.
 */
export function toAppHostingConfig(config: RunSingle): AppHostingSingle {
  return {
    backendId: config.serviceId,
    rootDir: config.rootDir || "",
    ignore: config.ignore as string[],
    localBuild: config.localBuild,
  };
}

/**
 * Explains how to create a service that doesn't exist yet. Local builds need a base image,
 * which `firebase init run` sets, so they can't be created with `firebase deploy` alone.
 */
export function missingServiceMessage(config: RunSingle): string {
  const how = config.localBuild
    ? `Create it with ${clc.bold("firebase init run")}, which also sets the base image that local builds need.`
    : `Create it with ${clc.bold("firebase init run")} or ${clc.bold(`firebase deploy --only run:${config.serviceId}`)}.`;
  return `Cloud Run service ${config.serviceId} doesn't exist in ${config.region} yet. ${how}`;
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
 * Returns the container that serves traffic.
 */
export function mainContainer(template?: runv2.RevisionTemplate): runv2.Container | undefined {
  return template?.containers?.find((c) => c.ports?.length) ?? template?.containers?.[0];
}

/**
 * Copies a service's revision template so that updating it creates a new revision.
 */
export function copyTemplate(service: runv2.Service): runv2.RevisionTemplate {
  const template = cloneDeep(service.template);
  delete template.revision;
  return template;
}

/**
 * Deploys a new revision of an existing service and sends it all traffic.
 */
export function deployRevision(
  service: runv2.Service,
  template: runv2.RevisionTemplate,
): Promise<runv2.Service> {
  const tags = (service.traffic || []).filter((t) => t.tag).map(({ percent: _, ...t }) => t);
  return runv2.updateService(
    {
      name: service.name,
      template,
      traffic: [{ type: "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST", percent: 100 }, ...tags],
    },
    { updateMask: ["template", "traffic"], masterTimeout: SERVICE_OPERATION_TIMEOUT_MS },
  );
}
