import * as clc from "colorette";
import { FirebaseError } from "../../error";
import * as run from "../../gcp/run";
import * as runv2 from "../../gcp/runv2";
import { parseServiceName } from "./util";

/**
 * Returns the project's service with this ID, in `region` if one is given, in Cloud Run's service
 * YAML format: the v1 API's, which `gcloud run services describe` prints.
 */
export async function getServiceSpec(
  projectId: string,
  serviceId: string,
  region?: string,
): Promise<run.Service> {
  // Lists even when a region is given, to keep one code path. If listing turns out to be slow,
  // fetch the service directly with run.getService when there's a region.
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
