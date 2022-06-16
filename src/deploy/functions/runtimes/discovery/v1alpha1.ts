import * as backend from "../../backend";
import * as build from "../../build";
import * as runtimes from "..";
import { copyIfPresent, renameIfPresent, secondsFromDuration } from "../../../../gcp/proto";
import { assertKeyTypes, requireKeys } from "./parsing";
import { FirebaseError } from "../../../../error";

const CHANNEL_NAME_REGEX = new RegExp(
  "(projects\\/" +
    "(?<project>(?:\\d+)|(?:[A-Za-z]+[A-Za-z\\d-]*[A-Za-z\\d]?))\\/)?" +
    "locations\\/" +
    "(?<location>[A-Za-z\\d\\-_]+)\\/" +
    "channels\\/" +
    "(?<channel>[A-Za-z\\d\\-_]+)"
);

export interface ManifestSecretEnv {
  key: string;
  secret?: string;
  projectId: string;
}

type Base = Omit<backend.ServiceConfiguration, "secretEnvironmentVariables">;
export type ManifestEndpoint = Base &
  backend.Triggered &
  Partial<backend.HttpsTriggered> &
  Partial<backend.CallableTriggered> &
  Partial<backend.EventTriggered> &
  Partial<backend.TaskQueueTriggered> &
  Partial<backend.BlockingTriggered> &
  Partial<backend.ScheduleTriggered> & {
    region?: string[];
    entryPoint: string;
    platform?: backend.FunctionsPlatform;
    secretEnvironmentVariables?: Array<ManifestSecretEnv>;
  };

export interface Manifest {
  specVersion: string;
  requiredAPIs?: backend.RequiredAPI[];
  endpoints: Record<string, ManifestEndpoint>;
}

/** Returns a Build from a v1alpha1 Manifest. */
export function buildFromV1Alpha1(
  yaml: unknown,
  project: string,
  region: string,
  runtime: runtimes.Runtime
): build.Build {
  const manifest = JSON.parse(JSON.stringify(yaml)) as Manifest;
  requireKeys("", manifest, "endpoints");
  assertKeyTypes("", manifest, {
    specVersion: "string",
    requiredAPIs: "array",
    endpoints: "object",
  });
  const bd: build.Build = build.empty();
  bd.requiredAPIs = parseRequiredAPIs(manifest);
  for (const id of Object.keys(manifest.endpoints)) {
    const me: ManifestEndpoint = manifest.endpoints[id];
    assertManifestEndpoint(me, id);
    const be: build.Endpoint = parseEndpointForBuild(id, me, project, region, runtime);
    bd.endpoints[id] = be;
  }
  return bd;
}

/** Returns a Backend from a v1alpha1 Manifest. */
export function backendFromV1Alpha1(
  yaml: unknown,
  project: string,
  region: string,
  runtime: runtimes.Runtime
): backend.Backend {
  const manifest = JSON.parse(JSON.stringify(yaml)) as Manifest;
  const bkend: backend.Backend = backend.empty();
  bkend.requiredAPIs = parseRequiredAPIs(manifest);
  requireKeys("", manifest, "endpoints");
  assertKeyTypes("", manifest, {
    specVersion: "string",
    requiredAPIs: "array",
    endpoints: "object",
  });
  for (const id of Object.keys(manifest.endpoints)) {
    for (const parsed of parseEndpoints(manifest, id, project, region, runtime)) {
      bkend.endpoints[parsed.region] = bkend.endpoints[parsed.region] || {};
      bkend.endpoints[parsed.region][parsed.id] = parsed;
    }
  }
  return bkend;
}

function parseRequiredAPIs(manifest: Manifest): backend.RequiredAPI[] {
  const requiredAPIs: backend.RequiredAPI[] = manifest.requiredAPIs || [];
  for (const { api, reason } of requiredAPIs) {
    if (typeof api !== "string") {
      throw new FirebaseError(`Invalid api "${JSON.stringify(api)}. Expected string`);
    }
    if (typeof reason !== "string") {
      throw new FirebaseError(
        `Invalid reason "${JSON.stringify(reason)} for API ${api}. Expected string`
      );
    }
  }
  return requiredAPIs;
}

function assertManifestEndpoint(ep: ManifestEndpoint, id: string): void {
  const prefix = `endpoints[${id}]`;
  assertKeyTypes(prefix, ep, {
    region: "array",
    platform: (platform) => backend.AllFunctionsPlatforms.includes(platform),
    entryPoint: "string",
    availableMemoryMb: (mem) => backend.AllMemoryOptions.includes(mem),
    maxInstances: "number",
    minInstances: "number",
    concurrency: "number",
    serviceAccountEmail: "string",
    timeoutSeconds: "number",
    vpc: "object",
    labels: "object",
    ingressSettings: (setting) => backend.AllIngressSettings.includes(setting),
    environmentVariables: "object",
    secretEnvironmentVariables: "array",
    httpsTrigger: "object",
    callableTrigger: "object",
    eventTrigger: "object",
    scheduleTrigger: "object",
    taskQueueTrigger: "object",
    blockingTrigger: "object",
    cpu: (cpu: backend.Endpoint["cpu"]) => typeof cpu === "number" || cpu === "gcf_gen1",
  });
  if (ep.vpc) {
    assertKeyTypes(prefix + ".vpc", ep.vpc, {
      connector: "string",
      egressSettings: (setting) => backend.AllVpcEgressSettings.includes(setting),
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
  if (backend.isEventTriggered(ep)) {
    requireKeys(prefix + ".eventTrigger", ep.eventTrigger, "eventType", "eventFilters");
    assertKeyTypes(prefix + ".eventTrigger", ep.eventTrigger, {
      eventFilters: "object",
      eventFilterPathPatterns: "object",
      eventType: "string",
      retry: "boolean",
      region: "string",
      serviceAccountEmail: "string",
      channel: "string",
    });
  } else if (backend.isHttpsTriggered(ep)) {
    assertKeyTypes(prefix + ".httpsTrigger", ep.httpsTrigger, {
      invoker: "array",
    });
  } else if (backend.isCallableTriggered(ep)) {
    // no-op
  } else if (backend.isScheduleTriggered(ep)) {
    assertKeyTypes(prefix + ".scheduleTrigger", ep.scheduleTrigger, {
      schedule: "string",
      timeZone: "string",
      retryConfig: "object",
    });
    assertKeyTypes(prefix + ".scheduleTrigger.retryConfig", ep.scheduleTrigger.retryConfig, {
      retryCount: "number",
      maxDoublings: "number",
      minBackoffDuration: "string",
      maxBackoffDuration: "string",
      maxRetryDuration: "string",
    });
  } else if (backend.isTaskQueueTriggered(ep)) {
    assertKeyTypes(prefix + ".taskQueueTrigger", ep.taskQueueTrigger, {
      rateLimits: "object",
      retryConfig: "object",
      invoker: "array",
    });
    if (ep.taskQueueTrigger.rateLimits) {
      assertKeyTypes(prefix + ".taskQueueTrigger.rateLimits", ep.taskQueueTrigger.rateLimits, {
        maxConcurrentDispatches: "number",
        maxDispatchesPerSecond: "number",
      });
    }
    if (ep.taskQueueTrigger.retryConfig) {
      assertKeyTypes(prefix + ".taskQueueTrigger.retryConfig", ep.taskQueueTrigger.retryConfig, {
        maxAttempts: "number",
        maxRetrySeconds: "number",
        minBackoffSeconds: "number",
        maxBackoffSeconds: "number",
        maxDoublings: "number",
      });
    }
  } else if (backend.isBlockingTriggered(ep)) {
    requireKeys(prefix + ".blockingTrigger", ep.blockingTrigger, "eventType");
    assertKeyTypes(prefix + ".blockingTrigger", ep.blockingTrigger, {
      eventType: "string",
      options: "object",
    });
  } else {
    throw new FirebaseError(
      `Do not recognize trigger type for endpoint ${id}. Try upgrading ` +
        "firebase-tools with npm install -g firebase-tools@latest"
    );
  }
}

function parseEndpointForBuild(
  id: string,
  ep: ManifestEndpoint,
  project: string,
  defaultRegion: string,
  runtime: runtimes.Runtime
): build.Endpoint {
  let triggered: build.Triggered;
  if (backend.isEventTriggered(ep)) {
    const { ...newTrigger } = ep.eventTrigger;
    delete newTrigger.serviceAccountEmail;
    triggered = { eventTrigger: newTrigger };
    triggered.eventTrigger.serviceAccount = ep.eventTrigger.serviceAccountEmail;
    renameIfPresent(triggered.eventTrigger, ep.eventTrigger, "channel", "channel", (c) =>
      resolveChannelName(project, c, defaultRegion)
    );
    for (const [k, v] of Object.entries(triggered.eventTrigger.eventFilters)) {
      if (k === "topic" && !v.startsWith("projects/")) {
        // Construct full pubsub topic name.
        triggered.eventTrigger.eventFilters[k] = `projects/${project}/topics/${v}`;
      }
    }
  } else if (backend.isHttpsTriggered(ep)) {
    triggered = { httpsTrigger: {} };
    copyIfPresent(triggered.httpsTrigger, ep.httpsTrigger, "invoker");
  } else if (backend.isCallableTriggered(ep)) {
    triggered = { callableTrigger: {} };
  } else if (backend.isScheduleTriggered(ep)) {
    const st: build.ScheduleTrigger = {
      schedule: ep.scheduleTrigger.schedule || "",
      timeZone: ep.scheduleTrigger.timeZone || "",
      retryConfig: {},
    };
    if (ep.scheduleTrigger.retryConfig) {
      st.retryConfig = {
        retryCount: ep.scheduleTrigger.retryConfig.retryCount,
        maxDoublings: ep.scheduleTrigger.retryConfig.maxDoublings,
      };
      if (ep.scheduleTrigger.retryConfig.maxRetryDuration) {
        st.retryConfig.maxRetrySeconds = secondsFromDuration(
          ep.scheduleTrigger.retryConfig.maxRetryDuration
        );
      }
      if (ep.scheduleTrigger.retryConfig.maxBackoffDuration) {
        st.retryConfig.maxBackoffSeconds = secondsFromDuration(
          ep.scheduleTrigger.retryConfig.maxBackoffDuration
        );
      }
      if (ep.scheduleTrigger.retryConfig.minBackoffDuration) {
        st.retryConfig.minBackoffSeconds = secondsFromDuration(
          ep.scheduleTrigger.retryConfig.minBackoffDuration
        );
      }
    }
    triggered = { scheduleTrigger: st };
  } else if (backend.isTaskQueueTriggered(ep)) {
    const tq: build.TaskQueueTrigger = {
      invoker: ep.taskQueueTrigger.invoker,
      rateLimits: ep.taskQueueTrigger.rateLimits,
    };
    if (ep.taskQueueTrigger.retryConfig) {
      tq.retryConfig = {
        maxRetryDurationSeconds: ep.taskQueueTrigger.retryConfig.maxRetrySeconds,
        maxBackoffSeconds: ep.taskQueueTrigger.retryConfig.maxBackoffSeconds,
        minBackoffSeconds: ep.taskQueueTrigger.retryConfig.minBackoffSeconds,
        maxDoublings: ep.taskQueueTrigger.retryConfig.maxDoublings,
        maxAttempts: ep.taskQueueTrigger.retryConfig.maxAttempts,
      };
    }
    triggered = { taskQueueTrigger: tq };
  } else if (backend.isBlockingTriggered(ep)) {
    triggered = { blockingTrigger: ep.blockingTrigger };
  } else {
    throw new FirebaseError(
      `Do not recognize trigger type for endpoint ${id}. Try upgrading ` +
        "firebase-tools with npm install -g firebase-tools@latest"
    );
  }

  const parsed: build.Endpoint = {
    platform: ep.platform || "gcfv2",
    region: ep.region || [defaultRegion],
    project,
    runtime,
    entryPoint: ep.entryPoint,
    serviceAccount: ep.serviceAccountEmail || null,
    ...triggered,
  };
  copyIfPresent(
    parsed,
    ep,
    "availableMemoryMb",
    "maxInstances",
    "minInstances",
    "concurrency",
    "timeoutSeconds",
    "vpc",
    "labels",
    "ingressSettings",
    "environmentVariables"
  );
  renameIfPresent(
    parsed,
    ep,
    "secretEnvironmentVariables",
    "secretEnvironmentVariables",
    (senvs: Array<ManifestSecretEnv>) => {
      const secretEnvironmentVariables: backend.SecretEnvVar[] = [];
      for (const { key, secret } of senvs) {
        secretEnvironmentVariables.push({
          key,
          secret: secret || key, // if secret is undefined, assume env var key == secret name
          projectId: project,
        });
      }
      return secretEnvironmentVariables;
    }
  );
  return parsed;
}

function parseEndpoints(
  manifest: Manifest,
  id: string,
  project: string,
  defaultRegion: string,
  runtime: runtimes.Runtime
): backend.Endpoint[] {
  const allParsed: backend.Endpoint[] = [];
  const prefix = `endpoints[${id}]`;
  const ep = manifest.endpoints[id];
  assertManifestEndpoint(ep, prefix);

  for (const region of ep.region || [defaultRegion]) {
    let triggered: backend.Triggered;
    if (backend.isEventTriggered(ep)) {
      triggered = { eventTrigger: ep.eventTrigger };
      renameIfPresent(triggered.eventTrigger, ep.eventTrigger, "channel", "channel", (c) =>
        resolveChannelName(project, c, defaultRegion)
      );
      for (const [k, v] of Object.entries(triggered.eventTrigger.eventFilters)) {
        if (k === "topic" && !v.startsWith("projects/")) {
          // Construct full pubsub topic name.
          triggered.eventTrigger.eventFilters[k] = `projects/${project}/topics/${v}`;
        }
      }
    } else if (backend.isHttpsTriggered(ep)) {
      triggered = { httpsTrigger: {} };
      copyIfPresent(triggered.httpsTrigger, ep.httpsTrigger, "invoker");
    } else if (backend.isCallableTriggered(ep)) {
      triggered = { callableTrigger: {} };
    } else if (backend.isScheduleTriggered(ep)) {
      triggered = { scheduleTrigger: ep.scheduleTrigger };
    } else if (backend.isTaskQueueTriggered(ep)) {
      triggered = { taskQueueTrigger: ep.taskQueueTrigger };
    } else if (backend.isBlockingTriggered(ep)) {
      triggered = { blockingTrigger: ep.blockingTrigger };
    } else {
      throw new FirebaseError(
        `Do not recognize trigger type for endpoint ${id}. Try upgrading ` +
          "firebase-tools with npm install -g firebase-tools@latest"
      );
    }

    requireKeys(prefix, ep, "entryPoint");
    const parsed: backend.Endpoint = {
      platform: ep.platform || "gcfv2",
      id,
      region,
      project,
      runtime,
      entryPoint: ep.entryPoint,
      ...triggered,
    };
    copyIfPresent(
      parsed,
      ep,
      "availableMemoryMb",
      "maxInstances",
      "minInstances",
      "concurrency",
      "serviceAccountEmail",
      "timeoutSeconds",
      "vpc",
      "labels",
      "ingressSettings",
      "environmentVariables",
      "cpu"
    );
    renameIfPresent(
      parsed,
      ep,
      "secretEnvironmentVariables",
      "secretEnvironmentVariables",
      (senvs: Array<ManifestSecretEnv>) => {
        const secretEnvironmentVariables: backend.SecretEnvVar[] = [];
        for (const { key, secret } of senvs) {
          secretEnvironmentVariables.push({
            key,
            secret: secret || key, // if secret is undefined, assume env var key == secret name
            projectId: project,
          });
        }
        return secretEnvironmentVariables;
      }
    );
    allParsed.push(parsed);
  }

  return allParsed;
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
