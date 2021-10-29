import * as backend from "../../backend";
import * as runtimes from "..";
import { copyIfPresent } from "../../../../gcp/proto";
import { assertKeyTypes, requireKeys } from "./parsing";
import { FirebaseError } from "../../../../error";

export type ManifestEndpoint = backend.ServiceConfiguration &
  backend.Triggered &
  Partial<backend.HttpsTriggered> &
  Partial<backend.EventTriggered> &
  Partial<backend.TaskQueueTriggered> &
  Partial<backend.ScheduleTriggered> & {
    region?: string[];
    entryPoint: string;
    platform?: backend.FunctionsPlatform;
  };

export interface Manifest {
  specVersion: string;
  requiredAPIs?: Record<string, string>;
  endpoints: Record<string, ManifestEndpoint>;
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
    requiredAPIs: "object",
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

function parseRequiredAPIs(manifest: Manifest): Record<string, string> {
  const requiredAPIs: Record<string, string> = {};
  // Note: this intentionally allows undefined to slip through as {}
  if (typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new FirebaseError("Expected requiredApis to be a map of string to string");
  }
  for (const [api, reason] of Object.entries(manifest.requiredAPIs || {})) {
    if (typeof reason !== "string") {
      throw new FirebaseError(
        `Invalid reason "${JSON.stringify(reason)} for API ${api}. Expected string`
      );
    }
    requiredAPIs[api] = reason;
  }
  return requiredAPIs;
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

  assertKeyTypes(prefix, ep, {
    region: "array",
    platform: "string",
    entryPoint: "string",
    availableMemoryMb: "number",
    maxInstances: "number",
    minInstances: "number",
    concurrency: "number",
    serviceAccountEmail: "string",
    timeout: "string",
    vpcConnector: "string",
    vpcConnectorEgressSettings: "string",
    labels: "object",
    ingressSettings: "string",
    environmentVariables: "object",
    httpsTrigger: "object",
    eventTrigger: "object",
    scheduleTrigger: "object",
    taskQueueTrigger: "object",
  });
  let triggerCount = 0;
  if (ep.httpsTrigger) {
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
  if (!triggerCount) {
    throw new FirebaseError("Expected trigger in endpoint" + id);
  }
  if (triggerCount > 1) {
    throw new FirebaseError("Multiple triggers defined for endpoint" + id);
  }
  for (const region of ep.region || [defaultRegion]) {
    let triggered: backend.Triggered;
    if (backend.isEventTriggered(ep)) {
      requireKeys(prefix + ".eventTrigger", ep.eventTrigger, "eventType", "eventFilters");
      assertKeyTypes(prefix + ".eventTrigger", ep.eventTrigger, {
        eventFilters: "object",
        eventType: "string",
        retry: "boolean",
        region: "string",
        serviceAccountEmail: "string",
      });
      triggered = { eventTrigger: ep.eventTrigger };
    } else if (backend.isHttpsTriggered(ep)) {
      assertKeyTypes(prefix + ".httpsTrigger", ep.httpsTrigger, {
        invoker: "array",
      });
      triggered = { httpsTrigger: {} };
      copyIfPresent(triggered.httpsTrigger, ep.httpsTrigger, "invoker");
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
      triggered = { scheduleTrigger: ep.scheduleTrigger };
    } else if (backend.isTaskQueueTriggered(ep)) {
      assertKeyTypes(prefix + ".taskQueueTrigger", ep.taskQueueTrigger, {
        rateLimits: "object",
        retryPolicy: "object",
        invoker: "array",
      });
      if (ep.taskQueueTrigger.rateLimits) {
        assertKeyTypes(prefix + ".taskQueueTrigger.rateLimits", ep.taskQueueTrigger.rateLimits, {
          maxBurstSize: "number",
          maxConcurrentDispatches: "number",
          maxDispatchesPerSecond: "number",
        });
      }
      if (ep.taskQueueTrigger.retryPolicy) {
        assertKeyTypes(prefix + ".taskQueueTrigger.retryPolicy", ep.taskQueueTrigger.retryPolicy, {
          maxAttempts: "number",
          maxRetryDuration: "string",
          minBackoff: "string",
          maxBackoff: "string",
          maxDoublings: "number",
        });
      }
      triggered = { taskQueueTrigger: ep.taskQueueTrigger };
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
      "timeout",
      "vpcConnector",
      "vpcConnectorEgressSettings",
      "labels",
      "ingressSettings",
      "environmentVariables"
    );
    allParsed.push(parsed);
  }

  return allParsed;
}
