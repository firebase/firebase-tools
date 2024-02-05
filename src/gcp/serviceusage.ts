import { bold } from "colorette";
import { serviceUsageOrigin } from "../api";
import { Client } from "../apiv2";
import { FirebaseError } from "../error";
import * as utils from "../utils";

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
  prefix: string,
) {
  utils.logLabeledBullet(prefix, `generating the service identity for ${bold(service)}...`);
  try {
    return await apiClient.post<unknown, unknown>(
      `projects/${projectNumber}/services/${service}:generateServiceIdentity`,
    );
  } catch (err: unknown) {
    throw new FirebaseError(`Error generating the service identity for ${service}.`, {
      original: err as Error,
    });
  }
}
