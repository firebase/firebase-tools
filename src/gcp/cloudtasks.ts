import * as proto from "./proto";

import { Client } from "../apiv2";
import { cloudTasksOrigin } from "../api";
import * as iam from "./iam";
import * as backend from "../deploy/functions/backend";
import { nullsafeVisitor } from "../functional";

const API_VERSION = "v2";

const client = new Client({
  urlPrefix: cloudTasksOrigin,
  auth: true,
  apiVersion: API_VERSION,
});

export interface AppEngineRouting {
  service: string;
  version: string;
  instance: string;
  host: string;
}

export interface RateLimits {
  maxDispatchesPerSecond?: number | null;
  maxConcurrentDispatches?: number | null;
}

export interface RetryConfig {
  maxAttempts?: number | null;
  maxRetryDuration?: proto.Duration | null;
  minBackoff?: proto.Duration | null;
  maxBackoff?: proto.Duration | null;
  maxDoublings?: number | null;
}

export interface StackdriverLoggingConfig {
  samplingRatio: number;
}

export type State = "RUNNING" | "PAUSED" | "DISABLED";

export interface Queue {
  name: string;
  appEngienRoutingOverride?: AppEngineRouting;
  rateLimits?: RateLimits;
  retryConfig?: RetryConfig;
  state?: State;
}

/**
 * The client-side defaults we set for a queue.
 * Unlike most APIs, Cloud Tasks doesn't omit fields which
 * have default values. This means when we create a queue without
 * maxDoublings, for example, it will be returned as a queue with
 * maxDoublings set to 16. By setting our in-memory queue to the
 * server-side defaults we'll be able to more accurately see whether
 * our in-memory representation matches the current state on upsert
 * and avoid a PUT call.
 * NOTE: we explicitly _don't_ have the same default for
 * retryConfig.maxAttempts. The server-side default is effectively
 * infinite, which can cause customers to have runaway bills if the
 * function crashes. We settled on a Firebase default of 3 since
 * infrastructure errors also count against this limit and 1-(1-99.9%)^3
 * means we'll have 9-9s reliability of invoking the customer's
 * function at least once (though unfortuantely this math assumes
 * failures are independent events, which is generally untrue).
 */
export const DEFAULT_SETTINGS: Omit<Queue, "name"> = {
  rateLimits: {
    maxConcurrentDispatches: 1000,
    maxDispatchesPerSecond: 500,
  },
  state: "RUNNING",
  retryConfig: {
    maxDoublings: 16,
    maxAttempts: 3,
    maxBackoff: "3600s",
    minBackoff: "0.100s",
  },
};

/** Create a Queue that matches the spec. */
export async function createQueue(queue: Queue): Promise<Queue> {
  const path = queue.name.substring(0, queue.name.lastIndexOf("/"));
  const res = await client.post<Queue, Queue>(path, queue);
  return res.body;
}

/** Get the Queue for a given name. */
export async function getQueue(name: string): Promise<Queue> {
  const res = await client.get<Queue>(name);
  return res.body;
}

/** Updates a queue to match the passed parameter. */
export async function updateQueue(queue: Partial<Queue> & { name: string }): Promise<Queue> {
  const res = await client.patch<Queue, Queue>(queue.name, queue, {
    queryParams: { updateMask: proto.fieldMasks(queue).join(",") },
  });
  return res.body;
}

/** Ensures a queue exists with the given spec. Returns true if created and false if updated/left alone. */
export async function upsertQueue(queue: Queue): Promise<boolean> {
  try {
    // Here and throughout we use module.exports to ensure late binding & enable stubs in unit tests.
    const existing = await (module.exports.getQueue as typeof getQueue)(queue.name);
    if (JSON.stringify(queue) === JSON.stringify(existing)) {
      return false;
    }

    if (existing.state === "DISABLED") {
      await (module.exports.purgeQueue as typeof purgeQueue)(queue.name);
    }

    await (module.exports.updateQueue as typeof updateQueue)(queue);
    return false;
  } catch (err: any) {
    if (err?.context?.response?.statusCode === 404) {
      await (module.exports.createQueue as typeof createQueue)(queue);
      return true;
    }
    throw err;
  }
}

/** Purges all messages in a queue with a given name. */
export async function purgeQueue(name: string): Promise<void> {
  await client.post(`${name}:purge`);
}

/** Deletes a queue with a given name. */
export async function deleteQueue(name: string): Promise<void> {
  await client.delete(name);
}

/** Set the IAM policy of a given queue. */
export async function setIamPolicy(name: string, policy: iam.Policy): Promise<iam.Policy> {
  const res = await client.post<{ policy: iam.Policy }, iam.Policy>(`${name}:setIamPolicy`, {
    policy,
  });
  return res.body;
}

/** Returns the IAM policy of a given queue. */
export async function getIamPolicy(name: string): Promise<iam.Policy> {
  const res = await client.post<void, iam.Policy>(`${name}:getIamPolicy`);
  return res.body;
}

const ENQUEUER_ROLE = "roles/cloudtasks.enqueuer";

/** Ensures that the invoker policy is set for a given queue. */
export async function setEnqueuer(
  name: string,
  invoker: string[],
  assumeEmpty = false,
): Promise<void> {
  let existing: iam.Policy;
  if (assumeEmpty) {
    existing = {
      bindings: [],
      etag: "",
      version: 3,
    };
  } else {
    existing = await (module.exports.getIamPolicy as typeof getIamPolicy)(name);
  }

  const [, project] = name.split("/");
  const invokerMembers = proto.getInvokerMembers(invoker, project);
  while (true) {
    const policy: iam.Policy = {
      bindings: existing.bindings.filter((binding) => binding.role !== ENQUEUER_ROLE),
      etag: existing.etag,
      version: existing.version,
    };

    if (invokerMembers.length) {
      policy.bindings.push({ role: ENQUEUER_ROLE, members: invokerMembers });
    }

    if (JSON.stringify(policy) === JSON.stringify(existing)) {
      return;
    }

    try {
      await (module.exports.setIamPolicy as typeof setIamPolicy)(name, policy);
      return;
    } catch (err: any) {
      // Re-fetch on conflict
      if (err?.context?.response?.statusCode === 429) {
        existing = await (module.exports.getIamPolicy as typeof getIamPolicy)(name);
        continue;
      }
      throw err;
    }
  }
}

/** The name of the Task Queue we will use for this endpoint. */
export function queueNameForEndpoint(
  endpoint: backend.Endpoint & backend.TaskQueueTriggered,
): string {
  return `projects/${endpoint.project}/locations/${endpoint.region}/queues/${endpoint.id}`;
}

/** Creates an API type from an Endpoint type */
export function queueFromEndpoint(endpoint: backend.Endpoint & backend.TaskQueueTriggered): Queue {
  const queue: Required<Queue> = {
    ...(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as Omit<Required<Queue>, "name">),
    name: queueNameForEndpoint(endpoint),
  };
  if (endpoint.taskQueueTrigger.rateLimits) {
    proto.copyIfPresent(
      queue.rateLimits,
      endpoint.taskQueueTrigger.rateLimits,
      "maxConcurrentDispatches",
      "maxDispatchesPerSecond",
    );
  }
  if (endpoint.taskQueueTrigger.retryConfig) {
    proto.copyIfPresent(
      queue.retryConfig,
      endpoint.taskQueueTrigger.retryConfig,
      "maxAttempts",
      "maxDoublings",
    );
    proto.convertIfPresent(
      queue.retryConfig,
      endpoint.taskQueueTrigger.retryConfig,
      "maxRetryDuration",
      "maxRetrySeconds",
      nullsafeVisitor(proto.durationFromSeconds),
    );
    proto.convertIfPresent(
      queue.retryConfig,
      endpoint.taskQueueTrigger.retryConfig,
      "maxBackoff",
      "maxBackoffSeconds",
      nullsafeVisitor(proto.durationFromSeconds),
    );
    proto.convertIfPresent(
      queue.retryConfig,
      endpoint.taskQueueTrigger.retryConfig,
      "minBackoff",
      "minBackoffSeconds",
      nullsafeVisitor(proto.durationFromSeconds),
    );
  }
  return queue;
}

/** Creates a trigger type from API type */
export function triggerFromQueue(queue: Queue): backend.TaskQueueTriggered["taskQueueTrigger"] {
  const taskQueueTrigger: backend.TaskQueueTriggered["taskQueueTrigger"] = {};
  if (queue.rateLimits) {
    taskQueueTrigger.rateLimits = {};
    proto.copyIfPresent(
      taskQueueTrigger.rateLimits,
      queue.rateLimits,
      "maxConcurrentDispatches",
      "maxDispatchesPerSecond",
    );
  }
  if (queue.retryConfig) {
    taskQueueTrigger.retryConfig = {};
    proto.copyIfPresent(
      taskQueueTrigger.retryConfig,
      queue.retryConfig,
      "maxAttempts",
      "maxDoublings",
    );
    proto.convertIfPresent(
      taskQueueTrigger.retryConfig,
      queue.retryConfig,
      "maxRetrySeconds",
      "maxRetryDuration",
      nullsafeVisitor(proto.secondsFromDuration),
    );
    proto.convertIfPresent(
      taskQueueTrigger.retryConfig,
      queue.retryConfig,
      "maxBackoffSeconds",
      "maxBackoff",
      nullsafeVisitor(proto.secondsFromDuration),
    );
    proto.convertIfPresent(
      taskQueueTrigger.retryConfig,
      queue.retryConfig,
      "minBackoffSeconds",
      "minBackoff",
      nullsafeVisitor(proto.secondsFromDuration),
    );
  }
  return taskQueueTrigger;
}
