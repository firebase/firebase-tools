import * as path from "path";
import * as _ from "lodash";
import { fork } from "child_process";

import { FirebaseError } from "../../../../error";
import { logger } from "../../../../logger";
import * as backend from "../../backend";
import * as build from "../../build";
import * as api from "../../../../api";
import * as proto from "../../../../gcp/proto";
import * as runtimes from "../../runtimes";
import * as events from "../../../../functions/events";
import { nullsafeVisitor } from "../../../../functional";

const TRIGGER_PARSER = path.resolve(__dirname, "./triggerParser.js");

export interface ScheduleRetryConfig {
  retryCount?: number;
  maxRetryDuration?: string;
  minBackoffDuration?: string;
  maxBackoffDuration?: string;
  maxDoublings?: number;
}

/**
 * Configuration options for scheduled functions.
 */
export interface ScheduleAnnotation {
  schedule: string;
  timeZone?: string;
  retryConfig?: ScheduleRetryConfig;
}

// Defined in firebase-functions/src/cloud-function.ts
export interface TriggerAnnotation {
  name: string;
  platform?: "gcfv1" | "gcfv2";
  labels?: Record<string, string>;
  entryPoint: string;
  vpcConnector?: string;
  vpcConnectorEgressSettings?: string;
  ingressSettings?: string;
  availableMemoryMb?: number;
  timeout?: proto.Duration;
  maxInstances?: number;
  minInstances?: number;
  serviceAccountEmail?: string;
  secrets?: string[];
  httpsTrigger?: {
    invoker?: string[];
  };
  eventTrigger?: {
    eventType: string;
    resource: string;
    // Deprecated
    service: string;
  };
  taskQueueTrigger?: {
    rateLimits?: {
      maxConcurrentDispatches?: number;
      maxDispatchesPerSecond?: number;
    };
    retryConfig?: {
      maxAttempts?: number;
      maxRetryDuration?: proto.Duration;
      minBackoff?: proto.Duration;
      maxBackoff?: proto.Duration;
      maxDoublings?: number;
    };
    invoker?: string[];
  };
  blockingTrigger?: {
    eventType: string;
    options?: Record<string, unknown>;
  };
  failurePolicy?: {};
  schedule?: ScheduleAnnotation;
  timeZone?: string;
  regions?: string[];
  concurrency?: number;
}

/**
 * Removes any inspect options (`inspect` or `inspect-brk`) from options so the forked process is able to run (otherwise
 * it'll inherit process values and will use the same port).
 * @param options From either `process.execArgv` or `NODE_OPTIONS` envar (which is a space separated string)
 * @return `options` without any `inspect` or `inspect-brk` values
 */
function removeInspectOptions(options: string[]): string[] {
  return options.filter((opt) => !opt.startsWith("--inspect"));
}

function parseTriggers(
  projectId: string,
  sourceDir: string,
  configValues: backend.RuntimeConfigValues,
  envs: backend.EnvironmentVariables,
): Promise<TriggerAnnotation[]> {
  return new Promise((resolve, reject) => {
    const env = { ...envs } as NodeJS.ProcessEnv;
    env.GCLOUD_PROJECT = projectId;
    if (!_.isEmpty(configValues)) {
      env.CLOUD_RUNTIME_CONFIG = JSON.stringify(configValues);
    }

    const execArgv = removeInspectOptions(process.execArgv);
    if (env.NODE_OPTIONS) {
      env.NODE_OPTIONS = removeInspectOptions(env.NODE_OPTIONS.split(" ")).join(" ");
    }

    const parser = fork(TRIGGER_PARSER, [sourceDir], {
      silent: true,
      env: env,
      execArgv: execArgv,
    });

    parser.on("message", (message: { triggers?: any; error?: any }) => {
      if (message.triggers) {
        resolve(message.triggers);
      } else if (message.error) {
        reject(new FirebaseError(message.error, { exit: 1 }));
      }
    });

    parser.on("exit", (code) => {
      if (code !== 0) {
        reject(
          new FirebaseError(
            "There was an unknown problem while trying to parse function triggers.",
            { exit: 2 },
          ),
        );
      }
    });
  });
}

/** Currently we always use JS trigger parsing */
export function useStrategy(): Promise<boolean> {
  return Promise.resolve(true);
}

/**
 * Parse trigger annotations in sourceDir to generate backed.Build.
 */
export async function discoverBuild(
  projectId: string,
  sourceDir: string,
  runtime: runtimes.Runtime,
  configValues: backend.RuntimeConfigValues,
  envs: backend.EnvironmentVariables,
): Promise<build.Build> {
  const triggerAnnotations = await parseTriggers(projectId, sourceDir, configValues, envs);
  const want: build.Build = {
    requiredAPIs: [],
    endpoints: {},
    params: [],
  };
  for (const annotation of triggerAnnotations) {
    addResourcesToBuild(projectId, runtime, annotation, want);
  }
  return want;
}

/**
 * Parse trigger annotations in sourceDir to generate backed.Backend.
 */
export async function discoverBackend(
  projectId: string,
  sourceDir: string,
  runtime: runtimes.Runtime,
  configValues: backend.RuntimeConfigValues,
  envs: backend.EnvironmentVariables,
): Promise<backend.Backend> {
  const triggerAnnotations = await parseTriggers(projectId, sourceDir, configValues, envs);
  const want: backend.Backend = { ...backend.empty(), environmentVariables: envs };
  for (const annotation of triggerAnnotations) {
    addResourcesToBackend(projectId, runtime, annotation, want);
  }
  return want;
}

/**
 * Merge duplicate entries of requireAPIs in backend.Build.
 * @internal
 */
export function mergeRequiredAPIs(backend: backend.Backend) {
  const apiToReasons: Record<string, Set<string>> = {};
  for (const { api, reason } of backend.requiredAPIs) {
    const reasons = apiToReasons[api] || new Set();
    if (reason) {
      reasons.add(reason);
    }
    apiToReasons[api] = reasons;
  }

  const merged: backend.RequiredAPI[] = [];
  for (const [api, reasons] of Object.entries(apiToReasons)) {
    merged.push({ api, reason: Array.from(reasons).join(" ") });
  }

  backend.requiredAPIs = merged;
}

/**
 * Transform trigger annotation into endpoints in backend.Build.
 */
export function addResourcesToBuild(
  projectId: string,
  runtime: runtimes.Runtime,
  annotation: TriggerAnnotation,
  want: build.Build,
): void {
  Object.freeze(annotation);
  const toSeconds = nullsafeVisitor(proto.secondsFromDuration);
  const regions = annotation.regions || [api.functionsDefaultRegion];
  let triggered: build.Triggered;

  const triggerCount =
    +!!annotation.httpsTrigger +
    +!!annotation.eventTrigger +
    +!!annotation.taskQueueTrigger +
    +!!annotation.blockingTrigger;
  if (triggerCount !== 1) {
    throw new FirebaseError(
      "Unexpected annotation generated by the Firebase Functions SDK. This should never happen.",
    );
  }

  if (annotation.taskQueueTrigger) {
    want.requiredAPIs.push({
      api: "cloudtasks.googleapis.com",
      reason: "Needed for task queue functions.",
    });
    triggered = {
      taskQueueTrigger: {},
    };
    proto.copyIfPresent(triggered.taskQueueTrigger, annotation.taskQueueTrigger, "invoker");
    proto.copyIfPresent(triggered.taskQueueTrigger, annotation.taskQueueTrigger, "rateLimits");
    if (annotation.taskQueueTrigger.retryConfig) {
      triggered.taskQueueTrigger.retryConfig = {};
      proto.copyIfPresent(
        triggered.taskQueueTrigger.retryConfig,
        annotation.taskQueueTrigger.retryConfig,
        "maxAttempts",
        "maxDoublings",
      );
      proto.convertIfPresent(
        triggered.taskQueueTrigger.retryConfig,
        annotation.taskQueueTrigger.retryConfig,
        "minBackoffSeconds",
        "minBackoff",
        toSeconds,
      );
      proto.convertIfPresent(
        triggered.taskQueueTrigger.retryConfig,
        annotation.taskQueueTrigger.retryConfig,
        "maxBackoffSeconds",
        "maxBackoff",
        toSeconds,
      );
      proto.convertIfPresent(
        triggered.taskQueueTrigger.retryConfig,
        annotation.taskQueueTrigger.retryConfig,
        "maxRetrySeconds",
        "maxRetryDuration",
        toSeconds,
      );
    }
  } else if (annotation.httpsTrigger) {
    if (annotation.labels?.["deployment-callable"]) {
      delete annotation.labels["deployment-callable"];
      triggered = { callableTrigger: {} };
    } else {
      const trigger: build.HttpsTrigger = {};
      if (annotation.failurePolicy) {
        logger.warn(`Ignoring retry policy for HTTPS function ${annotation.name}`);
      }
      if (annotation.httpsTrigger.invoker) {
        trigger.invoker = annotation.httpsTrigger.invoker;
      }
      triggered = { httpsTrigger: trigger };
    }
  } else if (annotation.schedule) {
    want.requiredAPIs.push({
      api: "cloudscheduler.googleapis.com",
      reason: "Needed for scheduled functions.",
    });
    triggered = {
      scheduleTrigger: {
        schedule: annotation.schedule.schedule,
        timeZone: annotation.schedule.timeZone ?? null,
        retryConfig: {},
      },
    };
    if (annotation.schedule.retryConfig) {
      triggered.scheduleTrigger.retryConfig = {};
      proto.copyIfPresent(
        triggered.scheduleTrigger.retryConfig,
        annotation.schedule.retryConfig,
        "retryCount",
        "maxDoublings",
      );
      proto.convertIfPresent(
        triggered.scheduleTrigger.retryConfig,
        annotation.schedule.retryConfig,
        "maxRetrySeconds",
        "maxRetryDuration",
        toSeconds,
      );
      proto.convertIfPresent(
        triggered.scheduleTrigger.retryConfig,
        annotation.schedule.retryConfig,
        "minBackoffSeconds",
        "minBackoffDuration",
        toSeconds,
      );
      proto.convertIfPresent(
        triggered.scheduleTrigger.retryConfig,
        annotation.schedule.retryConfig,
        "maxBackoffSeconds",
        "maxBackoffDuration",
        toSeconds,
      );
    }
  } else if (annotation.blockingTrigger) {
    if (events.v1.AUTH_BLOCKING_EVENTS.includes(annotation.blockingTrigger.eventType as any)) {
      want.requiredAPIs.push({
        api: "identitytoolkit.googleapis.com",
        reason: "Needed for auth blocking functions.",
      });
    }
    triggered = {
      blockingTrigger: {
        eventType: annotation.blockingTrigger.eventType,
      },
    };
  } else if (annotation.eventTrigger) {
    triggered = {
      eventTrigger: {
        eventType: annotation.eventTrigger.eventType,
        eventFilters: { resource: annotation.eventTrigger.resource },
        retry: !!annotation.failurePolicy,
      },
    };
  } else {
    throw new FirebaseError(
      "Do not understand Cloud Function annotation without a trigger" +
        JSON.stringify(annotation, null, 2),
    );
  }

  const endpointId: string = annotation.name;
  const endpoint: build.Endpoint = {
    platform: annotation.platform || "gcfv1",
    region: regions,
    project: projectId,
    entryPoint: annotation.entryPoint,
    runtime: runtime,
    ...triggered,
  };
  proto.renameIfPresent(endpoint, annotation, "serviceAccount", "serviceAccountEmail");
  if (annotation.vpcConnector != null) {
    endpoint.vpc = { connector: annotation.vpcConnector };
    proto.renameIfPresent(endpoint.vpc, annotation, "egressSettings", "vpcConnectorEgressSettings");
  }
  proto.copyIfPresent(
    endpoint,
    annotation,
    "concurrency",
    "labels",
    "maxInstances",
    "minInstances",
    "availableMemoryMb",
  );
  proto.convertIfPresent(endpoint, annotation, "ingressSettings", (str) => {
    if (str === null) {
      return null;
    }
    if (!backend.AllIngressSettings.includes(str as backend.IngressSettings)) {
      throw new Error(`Invalid ingress setting ${str}`);
    }
    return str as backend.IngressSettings;
  });
  proto.convertIfPresent(
    endpoint,
    annotation,
    "timeoutSeconds",
    "timeout",
    proto.secondsFromDuration,
  );
  if (annotation.secrets) {
    endpoint.secretEnvironmentVariables = annotation.secrets.map<backend.SecretEnvVar>((secret) => {
      return {
        secret,
        projectId,
        key: secret,
      };
    });
  }
  want.endpoints[endpointId] = endpoint;
}

/**
 * Transform trigger annotation into endpoints in backend.Backend.
 */
export function addResourcesToBackend(
  projectId: string,
  runtime: runtimes.Runtime,
  annotation: TriggerAnnotation,
  want: backend.Backend,
): void {
  Object.freeze(annotation);
  // Every trigger annotation is at least a function
  for (const region of annotation.regions || [api.functionsDefaultRegion]) {
    let triggered: backend.Triggered;

    // +!! is 1 for truthy values and 0 for falsy values
    const triggerCount =
      +!!annotation.httpsTrigger +
      +!!annotation.eventTrigger +
      +!!annotation.taskQueueTrigger +
      +!!annotation.blockingTrigger;
    if (triggerCount !== 1) {
      throw new FirebaseError(
        "Unexpected annotation generated by the Firebase Functions SDK. This should never happen.",
      );
    }

    if (annotation.taskQueueTrigger) {
      triggered = { taskQueueTrigger: annotation.taskQueueTrigger };
      want.requiredAPIs.push({
        api: "cloudtasks.googleapis.com",
        reason: "Needed for task queue functions.",
      });
    } else if (annotation.httpsTrigger) {
      if (annotation.labels?.["deployment-callable"]) {
        delete annotation.labels["deployment-callable"];
        triggered = { callableTrigger: {} };
      } else {
        const trigger: backend.HttpsTrigger = {};
        if (annotation.failurePolicy) {
          logger.warn(`Ignoring retry policy for HTTPS function ${annotation.name}`);
        }
        proto.copyIfPresent(trigger, annotation.httpsTrigger, "invoker");
        triggered = { httpsTrigger: trigger };
      }
    } else if (annotation.schedule) {
      want.requiredAPIs.push({
        api: "cloudscheduler.googleapis.com",
        reason: "Needed for scheduled functions.",
      });
      triggered = { scheduleTrigger: annotation.schedule };
    } else if (annotation.blockingTrigger) {
      if (events.v1.AUTH_BLOCKING_EVENTS.includes(annotation.blockingTrigger.eventType as any)) {
        want.requiredAPIs.push({
          api: "identitytoolkit.googleapis.com",
          reason: "Needed for auth blocking functions.",
        });
      }
      triggered = {
        blockingTrigger: {
          eventType: annotation.blockingTrigger.eventType,
          options: annotation.blockingTrigger.options,
        },
      };
    } else {
      triggered = {
        eventTrigger: {
          eventType: annotation.eventTrigger!.eventType,
          eventFilters: { resource: annotation.eventTrigger!.resource },
          retry: !!annotation.failurePolicy,
        },
      };

      // TODO: yank this edge case for a v2 trigger on the pre-container contract
      // once we use container contract for the functionsv2 experiment.
      if (annotation.platform === "gcfv2") {
        if (annotation.eventTrigger!.eventType === events.v2.PUBSUB_PUBLISH_EVENT) {
          triggered.eventTrigger.eventFilters = { topic: annotation.eventTrigger!.resource };
        }

        if (
          events.v2.STORAGE_EVENTS.find(
            (event) => event === (annotation.eventTrigger?.eventType || ""),
          )
        ) {
          triggered.eventTrigger.eventFilters = { bucket: annotation.eventTrigger!.resource };
        }
      }
    }

    const endpoint: backend.Endpoint = {
      platform: annotation.platform || "gcfv1",
      id: annotation.name,
      region: region,
      project: projectId,
      entryPoint: annotation.entryPoint,
      runtime: runtime,
      ...triggered,
    };
    if (annotation.vpcConnector != null) {
      let maybeId = annotation.vpcConnector;
      if (maybeId && !maybeId.includes("/")) {
        maybeId = `projects/${projectId}/locations/${region}/connectors/${maybeId}`;
      }
      endpoint.vpc = { connector: maybeId };
      proto.renameIfPresent(
        endpoint.vpc,
        annotation,
        "egressSettings",
        "vpcConnectorEgressSettings",
      );
    }

    if (annotation.secrets) {
      const secretEnvs: backend.SecretEnvVar[] = [];
      for (const secret of annotation.secrets) {
        const secretEnv: backend.SecretEnvVar = {
          secret,
          projectId,
          key: secret,
        };
        secretEnvs.push(secretEnv);
      }
      endpoint.secretEnvironmentVariables = secretEnvs;
    }

    proto.copyIfPresent(
      endpoint,
      annotation,
      "concurrency",
      "labels",
      "maxInstances",
      "minInstances",
    );
    proto.renameIfPresent(endpoint, annotation, "serviceAccount", "serviceAccountEmail");

    proto.convertIfPresent(endpoint, annotation, "ingressSettings", (ingress) => {
      if (ingress == null) {
        return null;
      }
      if (!backend.AllIngressSettings.includes(ingress as backend.IngressSettings)) {
        throw new FirebaseError(`Invalid ingress setting ${ingress}`);
      }
      return ingress as backend.IngressSettings;
    });
    proto.convertIfPresent(endpoint, annotation, "availableMemoryMb", (mem) => {
      if (mem === null) {
        return null;
      }
      if (!backend.isValidMemoryOption(mem)) {
        throw new FirebaseError(
          `This version of firebase-tools does not know about the memory option ${mem}. Is an upgrade necessary?`,
        );
      }
      return mem;
    });
    proto.convertIfPresent(
      endpoint,
      annotation,
      "timeoutSeconds",
      "timeout",
      proto.secondsFromDuration,
    );
    want.endpoints[region] = want.endpoints[region] || {};
    want.endpoints[region][endpoint.id] = endpoint;

    mergeRequiredAPIs(want);
  }
}
