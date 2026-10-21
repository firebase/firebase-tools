import * as clc from "colorette";
import * as yaml from "yaml";
import { Command } from "../command";
import { parseServiceName } from "../deploy/run/util";
import { FirebaseError } from "../error";
import * as run from "../gcp/run";
import * as runv2 from "../gcp/runv2";
import { logger } from "../logger";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { requirePermissions } from "../requirePermissions";

export const command = new Command("run:services:get <serviceId>")
  .description("print a Cloud Run service's YAML specification, like gcloud run services describe")
  .option(
    "--region <region>",
    "the service's region, if the project has a service with this ID in more than one region",
  )
  .before(requirePermissions, ["run.services.list", "run.services.get"])
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
 * Returns the project's service with this ID, in `region` if one is given, in Cloud Run's service
 * YAML format: the v1 API's, which `gcloud run services describe` prints.
 */
export async function getServiceSpec(
  projectId: string,
  serviceId: string,
  region?: string,
): Promise<run.Service> {
  const matches = (await runv2.listServices(projectId, /* functionsOnly= */ false)).filter((s) => {
    const name = parseServiceName(s.name);
    return name.serviceId === serviceId && (!region || name.region === region);
  });
  if (!matches.length) {
    throw new FirebaseError(
      `Cloud Run service ${serviceId} doesn't exist in ${region ?? `project ${projectId}`}. ` +
        `See your services with ${clc.bold("firebase run:services:list")}.`,
    );
  }
  if (matches.length > 1) {
    const regions = matches.map((s) => parseServiceName(s.name).region);
    throw new FirebaseError(
      `Cloud Run service ${serviceId} exists in more than one region: ${regions.join(", ")}. ` +
        `Choose one with --region.`,
    );
  }
  // The v1 API names services the same way as v2.
  return run.getService(matches[0].name);
}
