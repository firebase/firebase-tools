import * as clc from "colorette";
import * as yaml from "yaml";
import { Command } from "../command";
import { parseServiceName, SERVICE_ID_REGEX } from "../deploy/run/util";
import { FirebaseError, getErrStatus } from "../error";
import * as run from "../gcp/run";
import * as runv2 from "../gcp/runv2";
import { logger } from "../logger";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { requirePermissions } from "../requirePermissions";

/** Cloud Run regions are lowercase words and digits joined by hyphens, like us-central1. */
const REGION_REGEX = /^[a-z]+(-[a-z0-9]+)+$/;

export const command = new Command("run:services:get <serviceId>")
  .description("print a Cloud Run service's YAML specification, like gcloud run services describe")
  .option(
    "--region <region>",
    "the service's region, if the project has a service with this ID in more than one region",
  )
  .before(requirePermissions, ["run.services.get"])
  .action(async (serviceId: string, options: Options) => {
    const projectId = needProjectId(options);
    const service = await getServiceSpec(
      projectId,
      serviceId,
      options.region as string | undefined,
    );
    // A line width of 0 keeps long values, like JSON annotations, on one line.
    logger.info(yaml.stringify(service, { lineWidth: 0 }));
    return service;
  });

/**
 * Returns the service in Cloud Run's service YAML format, which is the v1 API's: the format that
 * `gcloud run services describe` prints and `gcloud run services replace` reads. Without a region,
 * it finds the service by its ID across the project's regions.
 */
export async function getServiceSpec(
  projectId: string,
  serviceId: string,
  region?: string,
): Promise<run.Service> {
  // Both go into the request's URL path, so only accept a valid service ID and region.
  if (!SERVICE_ID_REGEX.test(serviceId)) {
    throw new FirebaseError(
      `Invalid Cloud Run service ID "${serviceId}". Service IDs use lowercase letters, digits, ` +
        `and hyphens.`,
    );
  }
  if (region !== undefined && !REGION_REGEX.test(region)) {
    throw new FirebaseError(
      `Invalid region "${region}". Use a Cloud Run region, like us-central1.`,
    );
  }
  const location = region ?? (await findServiceRegion(projectId, serviceId));
  try {
    return await run.getService(
      `projects/${projectId}/locations/${location}/services/${serviceId}`,
    );
  } catch (err: unknown) {
    if (getErrStatus(err) === 404) {
      throw new FirebaseError(`Cloud Run service ${serviceId} doesn't exist in ${location}.`);
    }
    throw err;
  }
}

/**
 * Returns the region of the project's service with this ID. Service IDs are only unique within a
 * region, so this throws if the ID is in more than one region, as well as if it's in none.
 */
async function findServiceRegion(projectId: string, serviceId: string): Promise<string> {
  const regions = (await runv2.listServices(projectId, /* functionsOnly= */ false))
    .map((service) => parseServiceName(service.name))
    .filter((name) => name.serviceId === serviceId)
    .map((name) => name.region);
  if (!regions.length) {
    throw new FirebaseError(
      `Cloud Run service ${serviceId} doesn't exist in project ${projectId}. ` +
        `See your services with ${clc.bold("firebase run:services:list")}.`,
    );
  }
  if (regions.length > 1) {
    throw new FirebaseError(
      `Cloud Run service ${serviceId} exists in more than one region: ${regions.join(", ")}. ` +
        `Choose one with --region.`,
    );
  }
  return regions[0];
}
