import * as proto from "../../gcp/proto";
import * as gcf from "../../gcp/cloudfunctions";
import * as cloudscheduler from "../../gcp/cloudscheduler";
import * as utils from "../../utils";
import { FirebaseError } from "../../error";
import { Context } from "./args";
import { cloudfunctions } from "../../gcp";

export interface ScheduleRetryConfig {
  retryCount?: number;
  maxRetryDuration?: proto.Duration;
  minBackoffDuration?: proto.Duration;
  maxBackoffDuration?: proto.Duration;
  maxDoublings?: number;
}

export interface PubSubSpec {
  id: string;
  project: string;

  // What we're actually planning to invoke with this topic
  targetService: FunctionSpec;
}

export interface ScheduleSpec {
  id: string;
  project: string;
  // Note: schedule is missing in the existingBackend because we
  // don't actually spend the API call looking up the schedule;
  // we just infer identifiers from function labels.
  schedule?: string;
  timeZone?: string;
  retryConfig?: ScheduleRetryConfig;
  transport: "pubsub" | "https";

  // What we're actually planning to invoke with this schedule
  targetService: FunctionSpec;
}

export interface HttpsTrigger {
  httpsOnly: boolean;
}

export type EventFilterKey = "resource";
export interface EventTrigger {
  eventType: string;

  // In v1 API, only "resource" is set.
  // In v2 API, "resource" will be hoisted up as
  // a top-level "pubsubTopic" resource for the
  // google.cloud.pubsub.topic.v1.messagePublished event.
  eventFilters: Record<EventFilterKey | string, string>;

  retry: boolean;

  // API v2 only. Defaults to "global".
  region?: string;
  serviceAccountEmail?: string;
}

export function isEventTrigger(trigger: HttpsTrigger | EventTrigger): trigger is EventTrigger {
  return "eventType" in trigger;
}

export type VpcEgressSettings = "PRIVATE_RANGES_ONLY" | "ALL_TRAFFIC";
export type IngressSettings = "ALLOW_ALL" | "ALLOW_INTERNAL_ONLY" | "ALLOW_INTERNAL_AND_GCLB";
export type MemoryOptions = 128 | 256 | 512 | 1024 | 2048 | 4096;
export type Runtime = "nodejs6" | "nodejs8" | "nodejs10" | "nodejs12" | "nodejs14";

export interface FunctionSpec {
  apiVersion: 1 | 2;
  id: string;
  region: string;
  project: string;
  entryPoint: string;
  trigger: HttpsTrigger | EventTrigger;
  runtime: Runtime;

  labels?: Record<string, string>;
  environmentVariables?: Record<string, string>;
  availableMemoryMb?: MemoryOptions;
  timeoutSeconds?: number;
  maxInstances?: number;
  minInstances?: number;
  vpcConnector?: string;
  vpcConnectorEgressSettings?: VpcEgressSettings;
  ingressSettings?: IngressSettings;
  serviceAccount?: "default" | string;
}

// Note(inlined): I'd like to put topics in here explicitly, but I'd first have to
// do some refactoring so that we know the GAE region by the time we create the Backend
// spec.
export interface Backend {
  requiredAPIs: Record<string, string>; // friendly-name -> API name
  cloudFunctions: FunctionSpec[];
  schedules: ScheduleSpec[];
  topics: PubSubSpec[];
}

export const EMPTY: Backend = Object.freeze({
  requiredAPIs: {},
  cloudFunctions: [],
  schedules: [],
  topics: [],
});

export function isEmptyBackend(backend: Backend) {
  return (
    Object.keys(backend.requiredAPIs).length == 0 &&
    backend.cloudFunctions.length === 0 &&
    backend.schedules.length === 0 &&
    backend.topics.length === 0
  );
}

export type RuntimeConfigValues = Record<string, any>;

export function functionName(cloudFunction: FunctionSpec) {
  return `projects/${cloudFunction.project}/locations/${cloudFunction.region}/functions/${cloudFunction.id}`;
}

// Curried function that's useful in filters. Compares fields in decreasing entropy order
// to short circuit early (not like there's much point in optimizing JS...)
export const sameFunctionName = (func: FunctionSpec) => (test: FunctionSpec) => {
  return func.id === test.id && func.region === test.region && func.project == test.project;
};

export function scheduleName(schedule: ScheduleSpec, appEngineLocation: string) {
  return `projects/${schedule.project}/locations/${appEngineLocation}/jobs/${schedule.id}`;
}

// This method uses a separate struct that PubSubSpec conforms to so that a schedule
// can be passed as well
export function topicName(topic: { project: string; id: string }) {
  return `projects/${topic.project}/topics/${topic.id}`;
}

/*
 ** The naming pattern used to create a Pub/Sub Topic or Scheduler Job ID for a given scheduled function.
 ** This pattern is hard-coded and assumed throughout tooling, both in the Firebase Console and in the CLI.
 ** For e.g., we automatically assume a schedule and topic with this name exists when we list funcitons and
 ** see a label that it has an attached schedule. This saves us from making extra API calls.
 ** DANGER: We use the pattern defined here to deploy and delete schedules,
 ** and to display scheduled functions in the Firebase console
 ** If you change this pattern, Firebase console will stop displaying schedule descriptions
 ** and schedules created under the old pattern will no longer be cleaned up correctly
 */
export function scheduleIdForScheduledFunction(cloudFunction: FunctionSpec) {
  return `firebase-schedule-${cloudFunction.id}-${cloudFunction.region}`;
}

export function toGCFv1Function(
  cloudFunction: FunctionSpec,
  sourceUploadUrl: string
): Omit<gcf.CloudFunction, gcf.OutputOnlyFields> {
  if (cloudFunction.apiVersion != 1) {
    throw new FirebaseError(
      "Trying to create CloudFunction with wrong API. This should never happen"
    );
  }

  const gcfFunction: Omit<gcf.CloudFunction, gcf.OutputOnlyFields> = {
    name: functionName(cloudFunction),
    sourceUploadUrl: sourceUploadUrl,
    entryPoint: cloudFunction.entryPoint,
    runtime: cloudFunction.runtime,
  };

  if (isEventTrigger(cloudFunction.trigger)) {
    gcfFunction.eventTrigger = {
      eventType: cloudFunction.trigger.eventType,
      resource: cloudFunction.trigger.eventFilters.resource,
      // Service is unnecessary and deprecated
    };

    // For field masks to pick up a deleted failure policy we must inject an undefined
    // when retry is false
    gcfFunction.eventTrigger.failurePolicy = cloudFunction.trigger.retry
      ? { retry: {} }
      : undefined;
  } else {
    gcfFunction.httpsTrigger = {
      securityLevel: cloudFunction.trigger.httpsOnly ? "SECURE_ALWAYS" : "SECURE_OPTIONAL",
    };
  }

  proto.renameIfPresent(
    gcfFunction,
    cloudFunction,
    "timeout",
    "timeoutSeconds",
    proto.durationFromSeconds
  );
  proto.renameIfPresent(gcfFunction, cloudFunction, "serviceAccountEmail", "serviceAccount");
  proto.copyIfPresent(
    gcfFunction,
    cloudFunction,
    "availableMemoryMb",
    "minInstances",
    "maxInstances",
    "vpcConnector",
    "vpcConnectorEgressSettings",
    "ingressSettings",
    "labels",
    "environmentVariables"
  );

  return gcfFunction;
}

// NOTE: consider moving into /gcf/functions and making the API return a FunctionSpec.
// This would require us to make CreateFunction and UpdateFunction poll their own operations
// though.
export function fromGCFv1Function(gcfFunction: gcf.CloudFunction): FunctionSpec {
  const [, project, , region, , id] = gcfFunction.name.split("/");
  let trigger: EventTrigger | HttpsTrigger;
  if (gcfFunction.httpsTrigger) {
    trigger = {
      // Note: default (empty) value intentionally means false
      httpsOnly: gcfFunction.httpsTrigger.securityLevel === "SECURE_ALWAYS",
    };
  } else {
    trigger = {
      eventType: gcfFunction.eventTrigger!.eventType,
      eventFilters: {
        resource: gcfFunction.eventTrigger!.resource,
      },
      retry: !!gcfFunction.eventTrigger!.failurePolicy?.retry,
    };
  }
  const cloudFunction: FunctionSpec = {
    apiVersion: 1,
    id,
    project,
    region,
    trigger,
    entryPoint: gcfFunction.entryPoint,
    runtime: gcfFunction.runtime,
  };
  proto.renameIfPresent(
    cloudFunction,
    gcfFunction,
    "timeoutSeconds",
    "timeout",
    proto.secondsFromDuration
  );
  proto.renameIfPresent(cloudFunction, gcfFunction, "serviceAccount", "serviceAccountEmail");
  proto.copyIfPresent(
    cloudFunction,
    gcfFunction,
    "availableMemoryMb",
    "minInstances",
    "maxInstances",
    "vpcConnector",
    "vpcConnectorEgressSettings",
    "ingressSettings",
    "labels",
    "environmentVariables"
  );

  return cloudFunction;
}

export function toJob(schedule: ScheduleSpec, appEngineLocation: string): cloudscheduler.Job {
  const job: cloudscheduler.Job = {
    name: scheduleName(schedule, appEngineLocation),
    schedule: schedule.schedule!,
  };
  proto.copyIfPresent(job, schedule, "retryConfig");
  if (schedule.transport === "https") {
    throw new FirebaseError("HTTPS transport for scheduled functions is not yet supported");
  }
  job.pubsubTarget = {
    topicName: topicName(schedule),
    attributes: {
      scheduled: "true",
    },
  };
  return job;
}

interface PrivateContextFields {
  existingBackend: Backend;
  loadedExistingBackend?: boolean;

  // NOTE(inlined): Will this need to become a more nuanced data structure
  // if we support GCFv1, v2, and Run?
  unreachableRegions: {
    gcfv1: string[];
  };
}

export async function existingBackend(context: Context): Promise<Backend> {
  const ctx = context as Context & PrivateContextFields;
  if (!ctx.loadedExistingBackend) {
    await loadExistingBackend(ctx);
  }
  return ctx.existingBackend;
}

async function loadExistingBackend(ctx: Context & PrivateContextFields): Promise<void> {
  ctx.loadedExistingBackend = true;
  // Note: is it worth deducing the APIs that must have been enabled for this backend to work?
  // it could reduce redundant API calls for enabling the APIs.
  ctx.existingBackend = {
    requiredAPIs: {},
    cloudFunctions: [],
    schedules: [],
    topics: [],
  };
  ctx.unreachableRegions = {
    gcfv1: [],
  };
  const { functions, unreachable } = await gcf.listAllFunctions(ctx.projectId);
  for (const apiFunction of functions) {
    const specFunction = fromGCFv1Function(apiFunction);
    ctx.existingBackend.cloudFunctions.push(specFunction);
    const isScheduled = apiFunction.labels?.["deployment-scheduled"] === "true";
    if (isScheduled) {
      const id = scheduleIdForScheduledFunction(specFunction);
      ctx.existingBackend.schedules.push({
        id,
        project: specFunction.project,
        transport: "pubsub",
        targetService: specFunction,
      });
      ctx.existingBackend.topics.push({
        id,
        project: specFunction.project,
        targetService: specFunction,
      });
    }
  }
  ctx.unreachableRegions.gcfv1 = [...unreachable];
}

// TODO(inilned): This is just copying existing functionality. Should we complciate
// this to handle filters and region options?
export async function checkAvailability(context: Context, want: Backend) {
  const ctx = context as Context & PrivateContextFields;
  if (!ctx.loadedExistingBackend) {
    await loadExistingBackend(ctx);
  }
  const gcfv1Regions = new Set();
  want.cloudFunctions
    .filter((fn) => fn.apiVersion === 1)
    .forEach((fn) => gcfv1Regions.add(fn.region));
  const neededUnreachableRegions = ctx.unreachableRegions.gcfv1.filter((region) =>
    gcfv1Regions.has(region)
  );
  if (neededUnreachableRegions.length) {
    throw new FirebaseError(
      "The following Cloud Functions regions are currently unreachable:\n\t" +
        neededUnreachableRegions.join("\n\t") +
        "\nThis deployment contains functions in those regions. Please try again in a few minutes, or exclude these regions from your deployment."
    );
  } else if (ctx.unreachableRegions.gcfv1.length) {
    // TODO(inlined): Warn that these are GCF *v1* regions that are unavailable if the user
    // has run the open sesame command.
    utils.logLabeledWarning(
      "functions",
      "The following Cloud Functions regions are currently unreachable:\n" +
        ctx.unreachableRegions.gcfv1.join("\n") +
        "\nCloud Functions in these regions won't be deleted."
    );
  }
}
