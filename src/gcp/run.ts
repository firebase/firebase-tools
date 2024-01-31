import { Client } from "../apiv2";
import { FirebaseError } from "../error";
import { runOrigin } from "../api";
import * as proto from "./proto";
import * as iam from "./iam";
import { backoff } from "../throttler/throttler";
import { logger } from "../logger";

const API_VERSION = "v1";

const client = new Client({
  urlPrefix: runOrigin,
  auth: true,
  apiVersion: API_VERSION,
});

export const LOCATION_LABEL = "cloud.googleapis.com/location";

// Unfortuantely, Omit<> doesn't allow supbath, so it's hard to have a reasonable API that
// declares all mandatory fields as mandatory and then accepts an Omit<> for update types.

export interface ObjectMetadata {
  name: string;

  // Must be the project ID or project number
  namespace: string;

  labels?: Record<string, string>;

  // Not supported in Cloud Run:
  generate_name?: string;
  deletionGracePeriodSeconds?: number;
  finalizers?: string[];
  clusterName?: string;

  // Output only:
  selfLink?: string;
  uid?: string;
  resourceVersion?: string;
  generation?: number;
  createTime?: string;

  // Onput only; not supported by Cloud Run
  ownerReference?: unknown;
  deleteTime?: string;
}

export interface Addressable {
  url: string;
}

export interface Condition {
  type: string;
  status: string;
  reason: string;
  message: string;
  lastTransitionTime: string;
  severity: "Error" | "Warning" | "Info";
}

export interface ServiceSpec {
  template: RevisionTemplate;
  traffic: TrafficTarget[];
}

// All fields in ServiceStatus are output only so we will assume
// that an input Service will just Omit<"status">
export interface ServiceStatus {
  observedGeneration: number;
  conditions: Condition[];
  latestReadyRevisionName: string;
  latestCreatedRevisionName: string;
  traffic: TrafficTarget[];
  url: string;
  address: Addressable;
}

export interface Service {
  apiVersion: "serving.knative.dev/v1";
  kind: "Service";
  metadata: ObjectMetadata;
  spec: ServiceSpec;
  status?: ServiceStatus;
}

export interface Container {
  image: string;
  ports: Array<{ name: string; containerPort: number }>;
  env: Record<string, string>;
  resources: {
    limits: {
      cpu: string;
      memory: string;
    };
  };
}

export interface RevisionSpec {
  containerConcurrency?: number | null;
  containers: Container[];
}

export interface RevisionTemplate {
  metadata: Partial<ObjectMetadata>;
  spec: RevisionSpec;
}

export interface TrafficTarget {
  configurationName?: string;
  // RevisionName can be used to target a specific revision,
  // or customers can set latestRevision = true
  revisionName?: string;
  latestRevision?: boolean;
  percent?: number; // optional when tagged
  tag?: string;

  // Output only:
  // Displayed when TrafficTarget is part of a status and forbidden
  // when TrafficTarget is part of spec.
  url?: string;
}

export interface IamPolicy {
  version?: number;
  bindings?: iam.Binding[];
  auditConfigs?: Record<string, unknown>[];
  etag?: string;
}

export interface GCPIds {
  serviceId: string;
  region: string;
  projectNumber: string;
}

/**
 * Gets the standard project/location/id tuple from the K8S style resource.
 */
export function gcpIds(service: Pick<Service, "metadata">): GCPIds {
  return {
    serviceId: service.metadata.name,
    projectNumber: service.metadata.namespace,
    region: service.metadata.labels?.[LOCATION_LABEL] || "unknown-region",
  };
}
/**
 * Gets a service with a given name.
 */
export async function getService(name: string): Promise<Service> {
  try {
    const response = await client.get<Service>(name);
    return response.body;
  } catch (err: any) {
    throw new FirebaseError(`Failed to fetch Run service ${name}`, {
      original: err,
      status: err?.context?.response?.statusCode,
    });
  }
}

/**
 * Update a service and wait for changes to replicate.
 */
export async function updateService(name: string, service: Service): Promise<Service> {
  delete service.status;
  service = await exports.replaceService(name, service);

  // Now we need to wait for reconciliation or we might delete the docker
  // image while the service is still rolling out a new revision.
  let retry = 0;
  while (!exports.serviceIsResolved(service)) {
    await backoff(retry, 2, 30);
    retry = retry + 1;
    service = await exports.getService(name);
  }
  return service;
}

/**
 * Returns whether a service is resolved (all transitions have completed).
 */
export function serviceIsResolved(service: Service): boolean {
  if (service.status?.observedGeneration !== service.metadata.generation) {
    logger.debug(
      `Service ${service.metadata.name} is not resolved because` +
        `observed generation ${service.status?.observedGeneration} does not ` +
        `match spec generation ${service.metadata.generation}`,
    );
    return false;
  }
  const readyCondition = service.status?.conditions?.find((condition) => {
    return condition.type === "Ready";
  });

  if (readyCondition?.status === "Unknown") {
    logger.debug(
      `Waiting for service ${service.metadata.name} to be ready. ` +
        `Status is ${JSON.stringify(service.status?.conditions)}`,
    );
    return false;
  } else if (readyCondition?.status === "True") {
    return true;
  }
  logger.debug(
    `Service ${service.metadata.name} has unexpected ready status ${JSON.stringify(
      readyCondition,
    )}. It may have failed rollout.`,
  );
  throw new FirebaseError(
    `Unexpected Status ${readyCondition?.status} for service ${service.metadata.name}`,
  );
}

/**
 * Replaces a service spec. Prefer updateService to block on replication.
 */
export async function replaceService(name: string, service: Service): Promise<Service> {
  try {
    const response = await client.put<Service, Service>(name, service);
    return response.body;
  } catch (err: any) {
    throw new FirebaseError(`Failed to replace Run service ${name}`, {
      original: err,
      status: err?.context?.response?.statusCode,
    });
  }
}

/**
 * Sets the IAM policy of a Service
 * @param name Fully qualified name of the Service.
 * @param policy The [policy](https://cloud.google.com/run/docs/reference/rest/v1/projects.locations.services/setIamPolicy) to set.
 */
export async function setIamPolicy(
  name: string,
  policy: iam.Policy,
  httpClient: Client = client,
): Promise<void> {
  // Cloud Run has an atypical REST binding for SetIamPolicy. Instead of making the body a policy and
  // the update mask a query parameter (e.g. Cloud Functions v1) the request body is the literal
  // proto.
  interface Request {
    policy: iam.Policy;
    updateMask: string;
  }
  try {
    await httpClient.post<Request, IamPolicy>(`${name}:setIamPolicy`, {
      policy,
      updateMask: proto.fieldMasks(policy).join(","),
    });
  } catch (err: any) {
    throw new FirebaseError(`Failed to set the IAM Policy on the Service ${name}`, {
      original: err,
      status: err?.context?.response?.statusCode,
    });
  }
}

/**
 * Gets IAM policy for a service.
 */
export async function getIamPolicy(
  serviceName: string,
  httpClient: Client = client,
): Promise<IamPolicy> {
  try {
    const response = await httpClient.get<IamPolicy>(`${serviceName}:getIamPolicy`);
    return response.body;
  } catch (err: any) {
    throw new FirebaseError(`Failed to get the IAM Policy on the Service ${serviceName}`, {
      original: err,
    });
  }
}

/**
 * Gets the current IAM policy for the run service and overrides the invoker role with the supplied invoker members
 * @param projectId id of the project
 * @param serviceName cloud run service
 * @param invoker an array of invoker strings
 * @throws {@link FirebaseError} on an empty invoker, when the IAM Polciy fails to be grabbed or set
 */
export async function setInvokerCreate(
  projectId: string,
  serviceName: string,
  invoker: string[],
  httpClient: Client = client, // for unit testing
) {
  if (invoker.length === 0) {
    throw new FirebaseError("Invoker cannot be an empty array");
  }
  const invokerMembers = proto.getInvokerMembers(invoker, projectId);
  const invokerRole = "roles/run.invoker";
  const bindings = [{ role: invokerRole, members: invokerMembers }];

  const policy: iam.Policy = {
    bindings: bindings,
    etag: "",
    version: 3,
  };

  await setIamPolicy(serviceName, policy, httpClient);
}

/**
 * Gets the current IAM policy for the run service and overrides the invoker role with the supplied invoker members
 * @param projectId id of the project
 * @param serviceName cloud run service
 * @param invoker an array of invoker strings
 * @throws {@link FirebaseError} on an empty invoker, when the IAM Polciy fails to be grabbed or set
 */
export async function setInvokerUpdate(
  projectId: string,
  serviceName: string,
  invoker: string[],
  httpClient: Client = client, // for unit testing
) {
  if (invoker.length === 0) {
    throw new FirebaseError("Invoker cannot be an empty array");
  }
  const invokerMembers = proto.getInvokerMembers(invoker, projectId);
  const invokerRole = "roles/run.invoker";
  const currentPolicy = await getIamPolicy(serviceName, httpClient);
  const currentInvokerBinding = currentPolicy.bindings?.find(
    (binding) => binding.role === invokerRole,
  );
  if (
    currentInvokerBinding &&
    JSON.stringify(currentInvokerBinding.members.sort()) === JSON.stringify(invokerMembers.sort())
  ) {
    return;
  }

  const bindings = (currentPolicy.bindings || []).filter((binding) => binding.role !== invokerRole);
  bindings.push({
    role: invokerRole,
    members: invokerMembers,
  });

  const policy: iam.Policy = {
    bindings: bindings,
    etag: currentPolicy.etag || "",
    version: 3,
  };
  await setIamPolicy(serviceName, policy, httpClient);
}
