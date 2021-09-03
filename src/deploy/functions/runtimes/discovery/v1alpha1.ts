import * as backend from "../../backend";
import * as runtimes from "..";
import { assertKeyTypes, requireKeys } from "./parsing";

export function backendFromV1Alpha1(
  yaml: any,
  project: string,
  region: string,
  runtime: runtimes.Runtime
): backend.Backend {
  const bkend: backend.Backend = JSON.parse(JSON.stringify(yaml));
  delete (bkend as any).specVersion;
  tryValidate(bkend);
  fillDefaults(bkend, project, region, runtime);
  return bkend;
}

function tryValidate(typed: backend.Backend) {
  // Use a helper type to help guide code complete when writing this function
  assertKeyTypes("", typed, {
    requiredAPIs: "object",
    endpoints: "array",
    cloudFunctions: "array",
    topics: "array",
    schedules: "array",
    environmentVariables: "object",
  });
  requireKeys("", typed, "cloudFunctions");

  for (let ndx = 0; ndx < typed.cloudFunctions.length; ndx++) {
    const prefix = `cloudFunctions[${ndx}]`;
    const func = typed.cloudFunctions[ndx];
    requireKeys(prefix, func, "platform", "id", "entryPoint", "trigger");
    assertKeyTypes(prefix, func, {
      platform: "string",
      id: "string",
      region: "string",
      project: "string",
      runtime: "string",
      entryPoint: "string",
      availableMemoryMb: "number",
      maxInstances: "number",
      minInstances: "number",
      concurrency: "number",
      serviceAccountEmail: "string",
      timeout: "string",
      trigger: "object",
      vpcConnector: "string",
      vpcConnectorEgressSettings: "string",
      labels: "object",
      ingressSettings: "string",
      environmentVariables: "omit",
      uri: "omit",
      sourceUploadUrl: "omit",
    });
    if (backend.isEventTrigger(func.trigger)) {
      requireKeys(prefix + ".trigger", func.trigger, "eventType", "eventFilters");
      assertKeyTypes(prefix + ".trigger", func.trigger, {
        eventFilters: "object",
        eventType: "string",
        retry: "boolean",
        region: "string",
        serviceAccountEmail: "string",
      });
    } else {
      assertKeyTypes(prefix + ".trigger", func.trigger, {
        invoker: "array",
      });
    }
  }

  for (let ndx = 0; ndx < typed.topics?.length; ndx++) {
    let prefix = `topics[${ndx}]`;
    const topic = typed.topics[ndx];
    requireKeys(prefix, topic, "id", "targetService");
    assertKeyTypes(prefix, topic, {
      id: "string",
      labels: "object",
      project: "string",
      targetService: "object",
    });

    prefix += ".targetService";
    requireKeys(prefix, topic.targetService, "id");
    assertKeyTypes(prefix, topic.targetService, {
      id: "string",
      project: "string",
      region: "string",
    });
  }

  for (let ndx = 0; ndx < typed.schedules?.length; ndx++) {
    let prefix = `schedules[${ndx}]`;
    const schedule = typed.schedules[ndx];
    requireKeys(prefix, schedule, "id", "schedule", "transport", "targetService");
    assertKeyTypes(prefix, schedule, {
      id: "string",
      project: "string",
      retryConfig: "object",
      schedule: "string",
      timeZone: "string",
      transport: "string",
      targetService: "object",
    });

    assertKeyTypes(prefix + ".retryConfig", schedule.retryConfig, {
      maxBackoffDuration: "string",
      minBackoffDuration: "string",
      maxDoublings: "number",
      maxRetryDuration: "string",
      retryCount: "number",
    });

    requireKeys((prefix = ".targetService"), schedule.targetService, "id");
    assertKeyTypes(prefix + ".targetService", schedule.targetService, {
      id: "string",
      project: "string",
      region: "string",
    });
  }
}

function fillDefaults(
  want: backend.Backend,
  project: string,
  region: string,
  runtime: runtimes.Runtime
) {
  want.requiredAPIs = want.requiredAPIs || {};
  want.environmentVariables = want.environmentVariables || {};
  want.schedules = want.schedules || [];
  want.topics = want.topics || [];
  want.endpoints = want.endpoints || [];

  for (const cloudFunction of want.cloudFunctions) {
    if (!cloudFunction.project) {
      cloudFunction.project = project;
    }
    if (!cloudFunction.region) {
      cloudFunction.region = region;
    }
    if (!cloudFunction.runtime) {
      cloudFunction.runtime = runtime;
    }
  }

  for (const topic of want.topics) {
    if (!topic.project) {
      topic.project = project;
    }
    if (!topic.targetService.project) {
      topic.targetService.project = project;
    }
    if (!topic.targetService.region) {
      topic.targetService.region = region;
    }
  }

  for (const schedule of want.schedules) {
    if (!schedule.project) {
      schedule.project = project;
    }
    if (!schedule.targetService.project) {
      schedule.targetService.project = project;
    }
    if (!schedule.targetService.region) {
      schedule.targetService.region = region;
    }
  }
}
