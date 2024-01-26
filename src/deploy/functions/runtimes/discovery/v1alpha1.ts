import * as build from "../../build";
import * as params from "../../params";
import * as runtimes from "..";

import { copyIfPresent, convertIfPresent, secondsFromDuration } from "../../../../gcp/proto";
import { assertKeyTypes, requireKeys } from "./parsing";
import { FirebaseError } from "../../../../error";
import { nullsafeVisitor } from "../../../../functional";

const CHANNEL_NAME_REGEX = new RegExp(
  "(projects\\/" +
    "(?<project>(?:\\d+)|(?:[A-Za-z]+[A-Za-z\\d-]*[A-Za-z\\d]?))\\/)?" +
    "locations\\/" +
    "(?<location>[A-Za-z\\d\\-_]+)\\/" +
    "channels\\/" +
    "(?<channel>[A-Za-z\\d\\-_]+)",
);

export interface ManifestSecretEnv {
  key: string;
  secret?: string;
  projectId?: string;
}

// Note: v1 schedule functions use *Duration instead of *Seconds
// so this version of the API must allow these three retryConfig fields.
type WireScheduleTrigger = build.ScheduleTrigger & {
  retryConfig?: {
    maxRetryDuration?: string | null;
    minBackoffDuration?: string | null;
    maxBackoffDuration?: string | null;
  } | null;
};
// Note: v1 event trigger allowed users to specify "serviceAccountEmail"
// which has been changed for the same reasons as in the main endpoint.
type WireEventTrigger = build.EventTrigger & {
  serviceAccountEmail?: string | null;
};

export type WireEndpoint = build.Triggered &
  Partial<build.HttpsTriggered> &
  Partial<build.CallableTriggered> &
  Partial<{ eventTrigger: WireEventTrigger }> &
  Partial<build.TaskQueueTriggered> &
  Partial<build.BlockingTriggered> &
  Partial<{ scheduleTrigger: WireScheduleTrigger }> & {
    omit?: build.Field<boolean>;
    labels?: Record<string, string> | null;
    environmentVariables?: Record<string, string> | null;
    availableMemoryMb?: build.MemoryOption | build.Expression<number> | null;
    concurrency?: build.Field<number>;
    cpu?: number | "gcf_gen1" | null;
    timeoutSeconds?: build.Field<number>;
    maxInstances?: build.Field<number>;
    minInstances?: build.Field<number>;
    vpc?: {
      connector: string;
      egressSettings?: build.VpcEgressSetting | null;
    } | null;
    ingressSettings?: build.IngressSetting | null;
    serviceAccount?: string | null;
    // Note: Historically we used "serviceAccountEmail" to refer to a thing that
    // might not be an email (e.g. it might be "myAccount@"" to be project-relative)
    // We now use "serviceAccount" but maintain backwards compatibility in the
    // wire format for the time being.
    serviceAccountEmail?: string | null;
    region?: build.ListField;
    entryPoint: string;
    platform?: build.FunctionsPlatform;
    secretEnvironmentVariables?: Array<ManifestSecretEnv> | null;
  };

export interface WireManifest {
  specVersion: string;
  params?: params.Param[];
  requiredAPIs?: build.RequiredApi[];
  endpoints: Record<string, WireEndpoint>;
}

/** Returns a Build from a v1alpha1 Manifest. */
export function buildFromV1Alpha1(
  yaml: unknown,
  project: string,
  region: string,
  runtime: runtimes.Runtime,
): build.Build {
  const manifest = JSON.parse(JSON.stringify(yaml)) as WireManifest;
  requireKeys("", manifest, "endpoints");
  assertKeyTypes("", manifest, {
    specVersion: "string",
    params: "array",
    requiredAPIs: "array",
    endpoints: "object",
  });
  const bd: build.Build = build.empty();
  bd.params = manifest.params || [];
  bd.requiredAPIs = parseRequiredAPIs(manifest);
  for (const id of Object.keys(manifest.endpoints)) {
    const me: WireEndpoint = manifest.endpoints[id];
    assertBuildEndpoint(me, id);
    const be: build.Endpoint = parseEndpointForBuild(id, me, project, region, runtime);
    bd.endpoints[id] = be;
  }
  return bd;
}

function parseRequiredAPIs(manifest: WireManifest): build.RequiredApi[] {
  const requiredAPIs: build.RequiredApi[] = manifest.requiredAPIs || [];
  for (const { api, reason } of requiredAPIs) {
    if (typeof api !== "string") {
      throw new FirebaseError(`Invalid api "${JSON.stringify(api)}. Expected string`);
    }
    if (typeof reason !== "string") {
      throw new FirebaseError(
        `Invalid reason "${JSON.stringify(reason)} for API ${api}. Expected string`,
      );
    }
  }
  return requiredAPIs;
}

function assertBuildEndpoint(ep: WireEndpoint, id: string): void {
  const prefix = `endpoints[${id}]`;
  assertKeyTypes(prefix, ep, {
    region: "List",
    platform: (platform) => build.AllFunctionsPlatforms.includes(platform),
    entryPoint: "string",
    omit: "Field<boolean>?",
    availableMemoryMb: (mem) => mem === null || isCEL(mem) || build.isValidMemoryOption(mem),
    maxInstances: "Field<number>?",
    minInstances: "Field<number>?",
    concurrency: "Field<number>?",
    serviceAccount: "string?",
    serviceAccountEmail: "string?",
    timeoutSeconds: "Field<number>?",
    vpc: "object?",
    labels: "object?",
    ingressSettings: (setting) => setting === null || build.AllIngressSettings.includes(setting),
    environmentVariables: "object?",
    secretEnvironmentVariables: "array?",
    httpsTrigger: "object",
    callableTrigger: "object",
    eventTrigger: "object",
    scheduleTrigger: "object",
    taskQueueTrigger: "object",
    blockingTrigger: "object",
    cpu: (cpu) => cpu === null || isCEL(cpu) || cpu === "gcf_gen1" || typeof cpu === "number",
  });
  if (ep.vpc) {
    assertKeyTypes(prefix + ".vpc", ep.vpc, {
      connector: "string",
      egressSettings: (setting) => setting === null || build.AllVpcEgressSettings.includes(setting),
    });
    requireKeys(prefix + ".vpc", ep.vpc, "connector");
  }
  let triggerCount = 0;
  if (ep.httpsTrigger) {
    triggerCount++;
  }
  if (ep.callableTrigger) {
    triggerCount++;
  }
  if (ep.eventTrigger) {
    triggerCount++;
  }
  if (ep.scheduleTrigger) {
    triggerCount++;
  }
  if (ep.taskQueueTrigger) {
    triggerCount++;
  }
  if (ep.blockingTrigger) {
    triggerCount++;
  }
  if (!triggerCount) {
    throw new FirebaseError("Expected trigger in endpoint " + id);
  }
  if (triggerCount > 1) {
    throw new FirebaseError("Multiple triggers defined for endpoint" + id);
  }
  if (build.isEventTriggered(ep)) {
    requireKeys(prefix + ".eventTrigger", ep.eventTrigger, "eventType", "eventFilters");
    assertKeyTypes(prefix + ".eventTrigger", ep.eventTrigger, {
      eventFilters: "object",
      eventFilterPathPatterns: "object",
      eventType: "string",
      retry: "Field<boolean>",
      region: "Field<string>",
      serviceAccount: "string?",
      serviceAccountEmail: "string?",
      channel: "string",
    });
  } else if (build.isHttpsTriggered(ep)) {
    assertKeyTypes(prefix + ".httpsTrigger", ep.httpsTrigger, {
      invoker: "array?",
    });
  } else if (build.isCallableTriggered(ep)) {
    // no-op
  } else if (build.isScheduleTriggered(ep)) {
    assertKeyTypes(prefix + ".scheduleTrigger", ep.scheduleTrigger, {
      schedule: "Field<string>",
      timeZone: "Field<string>?",
      retryConfig: "object?",
    });
    if (ep.scheduleTrigger.retryConfig) {
      assertKeyTypes(prefix + ".scheduleTrigger.retryConfig", ep.scheduleTrigger.retryConfig, {
        retryCount: "Field<number>?",
        maxDoublings: "Field<number>?",
        minBackoffSeconds: "Field<number>?",
        maxBackoffSeconds: "Field<number>?",
        maxRetrySeconds: "Field<number>?",
        // The "duration" key types are supported for legacy compatibility reasons only.
        // They are not parametized and are automatically converted by the parser to seconds.
        maxRetryDuration: "string?",
        minBackoffDuration: "string?",
        maxBackoffDuration: "string?",
      });
    }
  } else if (build.isTaskQueueTriggered(ep)) {
    assertKeyTypes(prefix + ".taskQueueTrigger", ep.taskQueueTrigger, {
      rateLimits: "object?",
      retryConfig: "object?",
      invoker: "array?",
    });
    if (ep.taskQueueTrigger.rateLimits) {
      assertKeyTypes(prefix + ".taskQueueTrigger.rateLimits", ep.taskQueueTrigger.rateLimits, {
        maxConcurrentDispatches: "Field<number>?",
        maxDispatchesPerSecond: "Field<number>?",
      });
    }
    if (ep.taskQueueTrigger.retryConfig) {
      assertKeyTypes(prefix + ".taskQueueTrigger.retryConfig", ep.taskQueueTrigger.retryConfig, {
        maxAttempts: "Field<number>?",
        maxRetrySeconds: "Field<number>?",
        minBackoffSeconds: "Field<number>?",
        maxBackoffSeconds: "Field<number>?",
        maxDoublings: "Field<number>?",
      });
    }
  } else if (build.isBlockingTriggered(ep)) {
    requireKeys(prefix + ".blockingTrigger", ep.blockingTrigger, "eventType");
    assertKeyTypes(prefix + ".blockingTrigger", ep.blockingTrigger, {
      eventType: "string",
      options: "object",
    });
  } else {
    throw new FirebaseError(
      `Do not recognize trigger type for endpoint ${id}. Try upgrading ` +
        "firebase-tools with npm install -g firebase-tools@latest",
    );
  }
}

function parseEndpointForBuild(
  id: string,
  ep: WireEndpoint,
  project: string,
  defaultRegion: string,
  runtime: runtimes.Runtime,
): build.Endpoint {
  let triggered: build.Triggered;
  if (build.isEventTriggered(ep)) {
    const eventTrigger: build.EventTrigger = {
      eventType: ep.eventTrigger.eventType,
      retry: ep.eventTrigger.retry,
    };
    // Allow serviceAccountEmail but prefer serviceAccount
    if ("serviceAccountEmail" in (ep.eventTrigger as any)) {
      eventTrigger.serviceAccount = (ep.eventTrigger as any).serviceAccountEmail;
    }
    copyIfPresent(
      eventTrigger,
      ep.eventTrigger,
      "serviceAccount",
      "eventFilterPathPatterns",
      "region",
    );
    convertIfPresent(eventTrigger, ep.eventTrigger, "channel", (c) =>
      resolveChannelName(project, c, defaultRegion),
    );
    convertIfPresent(eventTrigger, ep.eventTrigger, "eventFilters", (filters) => {
      const copy = { ...filters };
      if (copy["topic"] && !copy["topic"].startsWith("projects/")) {
        copy["topic"] = `projects/${project}/topics/${copy["topic"]}`;
      }
      return copy;
    });
    triggered = { eventTrigger };
  } else if (build.isHttpsTriggered(ep)) {
    triggered = { httpsTrigger: {} };
    copyIfPresent(triggered.httpsTrigger, ep.httpsTrigger, "invoker");
  } else if (build.isCallableTriggered(ep)) {
    triggered = { callableTrigger: {} };
  } else if (build.isScheduleTriggered(ep)) {
    const st: build.ScheduleTrigger = {
      // TODO: consider adding validation for fields like this that reject
      // invalid values before actually modifying prod.
      schedule: ep.scheduleTrigger.schedule || "",
      timeZone: ep.scheduleTrigger.timeZone ?? null,
    };
    if (ep.scheduleTrigger.retryConfig) {
      st.retryConfig = {};
      convertIfPresent(
        st.retryConfig,
        ep.scheduleTrigger.retryConfig,
        "maxBackoffSeconds",
        "maxBackoffDuration",
        (duration) => (duration === null ? null : secondsFromDuration(duration)),
      );
      convertIfPresent(
        st.retryConfig,
        ep.scheduleTrigger.retryConfig,
        "minBackoffSeconds",
        "minBackoffDuration",
        (duration) => (duration === null ? null : secondsFromDuration(duration)),
      );
      convertIfPresent(
        st.retryConfig,
        ep.scheduleTrigger.retryConfig,
        "maxRetrySeconds",
        "maxRetryDuration",
        (duration) => (duration === null ? null : secondsFromDuration(duration)),
      );
      copyIfPresent(
        st.retryConfig,
        ep.scheduleTrigger.retryConfig,
        "retryCount",
        "minBackoffSeconds",
        "maxBackoffSeconds",
        "maxRetrySeconds",
        "maxDoublings",
      );
      convertIfPresent(
        st.retryConfig,
        ep.scheduleTrigger.retryConfig,
        "minBackoffSeconds",
        "minBackoffDuration",
        nullsafeVisitor(secondsFromDuration),
      );
      convertIfPresent(
        st.retryConfig,
        ep.scheduleTrigger.retryConfig,
        "maxBackoffSeconds",
        "maxBackoffDuration",
        nullsafeVisitor(secondsFromDuration),
      );
      convertIfPresent(
        st.retryConfig,
        ep.scheduleTrigger.retryConfig,
        "maxRetrySeconds",
        "maxRetryDuration",
        nullsafeVisitor(secondsFromDuration),
      );
    } else if (ep.scheduleTrigger.retryConfig === null) {
      st.retryConfig = null;
    }
    triggered = { scheduleTrigger: st };
  } else if (build.isTaskQueueTriggered(ep)) {
    const tq: build.TaskQueueTrigger = {};
    if (ep.taskQueueTrigger.invoker) {
      tq.invoker = ep.taskQueueTrigger.invoker;
    } else if (ep.taskQueueTrigger.invoker === null) {
      tq.invoker = null;
    }
    if (ep.taskQueueTrigger.retryConfig) {
      tq.retryConfig = { ...ep.taskQueueTrigger.retryConfig };
    } else if (ep.taskQueueTrigger.retryConfig === null) {
      tq.retryConfig = null;
    }
    if (ep.taskQueueTrigger.rateLimits) {
      tq.rateLimits = { ...ep.taskQueueTrigger.rateLimits };
    } else if (ep.taskQueueTrigger.rateLimits === null) {
      tq.rateLimits = null;
    }
    triggered = { taskQueueTrigger: tq };
  } else if (ep.blockingTrigger) {
    triggered = { blockingTrigger: ep.blockingTrigger };
  } else {
    throw new FirebaseError(
      `Do not recognize trigger type for endpoint ${id}. Try upgrading ` +
        "firebase-tools with npm install -g firebase-tools@latest",
    );
  }

  const parsed: build.Endpoint = {
    platform: ep.platform || "gcfv2",
    region: ep.region || [defaultRegion],
    project,
    runtime,
    entryPoint: ep.entryPoint,
    ...triggered,
  };
  // Allow "serviceAccountEmail" but prefer "serviceAccount"
  if ("serviceAccountEmail" in (ep as any)) {
    parsed.serviceAccount = (ep as any).serviceAccountEmail;
  }
  copyIfPresent(
    parsed,
    ep,
    "omit",
    "availableMemoryMb",
    "cpu",
    "maxInstances",
    "minInstances",
    "concurrency",
    "timeoutSeconds",
    "vpc",
    "labels",
    "ingressSettings",
    "environmentVariables",
    "serviceAccount",
  );
  convertIfPresent(parsed, ep, "secretEnvironmentVariables", (senvs) => {
    if (!senvs) {
      return null;
    }
    return senvs.map(({ key, secret }) => {
      return { key, secret: secret || key, projectId: project } as build.SecretEnvVar;
    });
  });
  return parsed;
}

function resolveChannelName(projectId: string, channel: string, defaultRegion: string): string {
  if (!channel.includes("/")) {
    const location = defaultRegion;
    const channelId = channel;
    return "projects/" + projectId + "/locations/" + location + "/channels/" + channelId;
  }
  const match = CHANNEL_NAME_REGEX.exec(channel);
  if (!match?.groups) {
    throw new FirebaseError("Invalid channel name format.");
  }
  const matchedProjectId = match.groups.project;
  const location = match.groups.location;
  const channelId = match.groups.channel;
  if (matchedProjectId) {
    return "projects/" + matchedProjectId + "/locations/" + location + "/channels/" + channelId;
  } else {
    return "projects/" + projectId + "/locations/" + location + "/channels/" + channelId;
  }
}

function isCEL(expr: any) {
  return typeof expr === "string" && expr.includes("{{") && expr.includes("}}");
}
