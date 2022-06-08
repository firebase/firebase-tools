import clccolor from "cli-color";
const { bold } = clccolor;
import apiv1Pkg from "../api.cjs";
const { serviceUsageOrigin } = apiv1Pkg;
import { Client } from "../apiv2.js";
import { FirebaseError } from "../error.js";
import * as utils from "../utils.js";

const apiClient = new Client({
  urlPrefix: serviceUsageOrigin,
  apiVersion: "v1beta1",
});

/**
 * Generate the service account for the service. Note: not every service uses the endpoint.
 * @param projectNumber gcp project number
 * @param service the service api (ex~ pubsub.googleapis.com)
 * @returns
 */
export async function generateServiceIdentity(
  projectNumber: string,
  service: string,
  prefix: string
) {
  utils.logLabeledBullet(prefix, `generating the service identity for ${bold(service)}...`);
  try {
    return await apiClient.post<unknown, unknown>(
      `projects/${projectNumber}/services/${service}:generateServiceIdentity`
    );
  } catch (err: unknown) {
    throw new FirebaseError(`Error generating the service identity for ${service}.`, {
      original: err as Error,
    });
  }
}
