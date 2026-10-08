import { FirebaseError, getErrStatus } from "../../error";
import { AppHostingSingle, RunSingle } from "../../firebaseConfig";
import * as runv2 from "../../gcp/runv2";
import { Options } from "../../options";
import { cloneDeep, logLabeledBullet } from "../../utils";

/** Rolling out a new revision can take longer than the operation poller's default timeout. */
export const SERVICE_OPERATION_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Returns every Cloud Run service in firebase.json. Throws if a service is listed twice.
 */
export function getAllServiceConfigs(options: Options): RunSingle[] {
  const rawConfig = options.config?.src?.run;
  const configs: RunSingle[] = [];
  if (Array.isArray(rawConfig)) {
    configs.push(...rawConfig);
  } else if (rawConfig) {
    configs.push(rawConfig);
  }
  const names = new Set<string>();
  for (const config of configs) {
    // Deploying a service without a region fails with its own "missing a region" error.
    if (!config.region) {
      continue;
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
 * Returns the Cloud Run services in firebase.json that match the --only filter.
 * run:<serviceId> matches that service ID in every region it's listed in, and
 * run:<serviceId>:<region> matches one service.
 */
export function getServiceConfigs(options: Options): RunSingle[] {
  const configs = getAllServiceConfigs(options);
  const selectors = options.only ? options.only.split(",") : ["run"];
  if (selectors.includes("run")) {
    return configs;
  }
  const selected = new Set<RunSingle>();
  const missing: string[] = [];
  for (const selector of selectors.filter((s) => s.startsWith("run:"))) {
    const name = selector.slice("run:".length);
    const matches = findServices(configs, name);
    if (!matches.length) {
      missing.push(name);
    } else if (matches.length > 1) {
      logLabeledBullet(
        "run",
        `${selector} matches ${matches.length} services in firebase.json: ` +
          `${matches.map(fullServiceName).join(", ")}. Deploying all of them. ` +
          `To deploy just one, use --only ${selector}:<region>.`,
      );
    }
    matches.forEach((m) => selected.add(m));
  }
  if (missing.length) {
    throw new FirebaseError(
      `Cloud Run service${missing.length > 1 ? "s" : ""} ${missing.join(", ")} not detected in firebase.json.`,
    );
  }
  return configs.filter((c) => selected.has(c));
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
  const tags = (service.traffic || [])
    .filter((t) => t.tag)
    .map((t) => {
      const tag = { ...t };
      delete tag.percent;
      return tag;
    });
  return runv2.updateService(
    {
      name: service.name,
      template,
      traffic: [{ type: "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST", percent: 100 }, ...tags],
    },
    {
      updateMask: ["template", "traffic"],
      pollTimeoutMs: SERVICE_OPERATION_TIMEOUT_MS,
    },
  );
}
