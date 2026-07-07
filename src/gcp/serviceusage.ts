import { bold } from "colorette";
import { serviceUsageOrigin } from "../api";
import { Client } from "../apiv2";
import { FirebaseError } from "../error";
import * as utils from "../utils";
import * as poller from "../operation-poller";
import { LongRunningOperation } from "../operation-poller";

const API_VERSION = "v1beta1";
const SERVICE_USAGE_ORIGIN = serviceUsageOrigin();

export const apiClient = new Client({
  urlPrefix: SERVICE_USAGE_ORIGIN,
  apiVersion: API_VERSION,
});

const serviceUsagePollerOptions: Omit<poller.OperationPollerOptions, "operationResourceName"> = {
  apiOrigin: SERVICE_USAGE_ORIGIN,
  apiVersion: API_VERSION,
};

/**
 * Generate the service account for the service. Note: not every service uses the endpoint.
 * @param projectNumber gcp project number
 * @param service the service api (ex~ pubsub.googleapis.com)
 * @return Promise<LongRunningOperation>
 */
export async function generateServiceIdentity(
  projectNumber: string,
  service: string,
  prefix: string,
): Promise<LongRunningOperation<unknown>> {
  utils.logLabeledBullet(prefix, `generating the service identity for ${bold(service)}...`);
  try {
    const res = await apiClient.post<unknown, unknown>(
      `projects/${projectNumber}/services/${service}:generateServiceIdentity`,
      /* body=*/ {},
      { headers: { "x-goog-user-project": `${projectNumber}` } },
    );
    return res.body as LongRunningOperation<unknown>;
  } catch (err: unknown) {
    throw new FirebaseError(`Error generating the service identity for ${service}.`, {
      original: err as Error,
    });
  }
}

/**
 * Calls GenerateServiceIdentity and polls till the operation is complete.
 */
export async function generateServiceIdentityAndPoll(
  projectNumber: string,
  service: string,
  prefix: string,
): Promise<void> {
  const op = await generateServiceIdentity(projectNumber, service, prefix);
  /**
   * Note: generateServiceIdenity seems to return a DONE operation with an
   * operation name of "finished.DONE_OPERATION" and querying the operation
   * returns a 400 error. As a workaround we check if the operation is DONE
   * before beginning to poll.
   */
  if (op.done) {
    return;
  }

  await poller.pollOperation<void>({
    ...serviceUsagePollerOptions,
    operationResourceName: op.name,
    headers: { "x-goog-user-project": `${projectNumber}` },
  });
}

/**
 * Disables a service on the project.
 */
export async function disableService(
  projectId: string,
  service: string,
): Promise<LongRunningOperation<unknown>> {
  try {
    const res = await apiClient.post<unknown, unknown>(
      `projects/${projectId}/services/${service}:disable`,
      /* body=*/ {},
      { headers: { "x-goog-user-project": `${projectId}` } },
    );
    return res.body as LongRunningOperation<unknown>;
  } catch (err: unknown) {
    throw new FirebaseError(`Error disabling service ${service}.`, {
      original: err as Error,
    });
  }
}

/**
 * Calls disableService and polls till the operation is complete.
 */
export async function disableServiceAndPoll(
  projectId: string,
  service: string,
  prefix: string,
): Promise<void> {
  utils.logLabeledBullet(prefix, `disabling service ${bold(service)}...`);
  const op = await disableService(projectId, service);
  if (op.done) {
    return;
  }

  await poller.pollOperation<void>({
    ...serviceUsagePollerOptions,
    operationResourceName: op.name,
    headers: { "x-goog-user-project": `${projectId}` },
  });
}
