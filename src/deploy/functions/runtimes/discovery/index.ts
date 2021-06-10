import fetch from "node-fetch";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { promisify } from "util";

import { logger } from "../../../../logger";
import * as api from "../../.../../../../api";
import * as backend from "../../backend";
import * as runtimes from "..";
import { FirebaseError } from "../../../../error";
import { schedule } from "firebase-functions/lib/providers/pubsub";
import { type } from "os";
import { reject } from "lodash";

const readFileAsync = promisify(fs.readFile);

// Use "omit" for output only fields. This allows us to fully exhaust keyof T
// while still recognizing output-only fields
type type = "string" | "number" | "boolean" | "object" | "array" | "omit";
function requireKeys<T extends object>(prefix: string, yaml: T, ...keys: (keyof T)[]) {
  if (prefix) {
    prefix = prefix + ".";
  }
  for (const key of keys) {
    if (!yaml[key]) {
      throw new FirebaseError(`Expected key ${prefix + key}`);
    }
  }
}

function assertKeyTypes<T extends Object>(
  prefix: string,
  yaml: T | undefined,
  schema: Record<keyof T, type>
) {
  if (!yaml) {
    return;
  }
  for (const [keyAsString, value] of Object.entries(yaml)) {
    // I don't know why Object.entries(foo)[0] isn't type of keyof foo...
    const key = keyAsString as keyof T;
    const fullKey = prefix ? prefix + "." + key : key;
    if (!schema[key] || schema[key] === "omit") {
      throw new FirebaseError(
        `Unexpected key ${fullKey}. You may need to install a newer version of the Firebase CLI`
      );
    }
    if (schema[key] === "string") {
      if (typeof value !== "string") {
        throw new FirebaseError(`Expected ${fullKey} to be string; was ${typeof value}`);
      }
    } else if (schema[key] === "number") {
      if (typeof value !== "number") {
        throw new FirebaseError(`Expected ${fullKey} to be a number; was ${typeof value}`);
      }
    } else if (schema[key] === "boolean") {
      if (typeof value !== "boolean") {
        throw new FirebaseError(`Expected ${fullKey} to be a boolean; was ${typeof value}`);
      }
    } else if (schema[key] === "array") {
      if (!Array.isArray(value)) {
        throw new FirebaseError(`Expected ${fullKey} to be an array; was ${typeof value}`);
      }
    } else if (schema[key] === "object") {
      if (typeof value !== "object") {
        throw new FirebaseError(`Expected ${fullKey} to be an object; was ${typeof value}`);
      }
    } else {
      throw new FirebaseError("YAML validation is missing a handled type " + schema[key]);
    }
  }
}

export function validateYaml(yaml: any) {
  try {
    tryValidateYaml(yaml);
  } catch (err) {
    throw new FirebaseError("Failed to parse backend specification", { children: [err] });
  }
}

function tryValidateYaml(yaml: any) {
  backend.empty().cloudFunctions[0];
  // Use a helper type to help guide code complete when writing this function
  const typed = yaml as backend.Backend;
  assertKeyTypes("", typed, {
    requiredAPIs: "object",
    cloudFunctions: "array",
    topics: "array",
    schedules: "array",
    environmentVariables: "object",
  });
  requireKeys("", typed, "cloudFunctions");

  for (let ndx = 0; ndx < typed.cloudFunctions.length; ndx++) {
    const prefix = `cloudFunctions[${ndx}]`;
    const func = typed.cloudFunctions[ndx];
    requireKeys(prefix, func, "apiVersion", "id", "entryPoint", "trigger");
    assertKeyTypes(prefix, func, {
      apiVersion: "number",
      id: "string",
      region: "string",
      project: "string",
      runtime: "string",
      entryPoint: "string",
      availableMemoryMb: "number",
      maxInstances: "number",
      minInstances: "number",
      serviceAccountEmail: "string",
      timeout: "string",
      trigger: "object",
      vpcConnector: "string",
      vpcConnectorEgressSettings: "object",
      labels: "object",
      ingressSettings: "object",
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
        allowInsecure: "boolean",
      });
    }
    // TODO: ingressSettings and vpcConnectorSettings
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

export async function detectFromYaml(
  directory: string,
  project: string,
  runtime: runtimes.Runtime
): Promise<backend.Backend | undefined> {
  let text: string;
  try {
    text = await readFileAsync(path.join(directory, "backend.yaml"), "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      logger.debug("Could not find backend.yaml. Must use http discovery");
    } else {
      logger.debug("Unexpected error looking for backend.yaml file:", err);
    }
    return;
  }

  logger.debug("Found backend.yaml. Got spec:", text);
  // TOODO(inlined): use a schema instead of manually checking everything or blindly trusting input.
  const parsed = yaml.load(text);
  validateYaml(parsed);
  fillDefaults(parsed, project, api.functionsDefaultRegion, runtime);
  return parsed;
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

export async function detectFromPort(
  port: number,
  project: string,
  runtime: runtimes.Runtime
): Promise<backend.Backend> {
  // The result type of fetch isn't exported
  let res: { text(): Promise<string> };
  const timeout = new Promise<never>((resolve, reject) => {
    setTimeout(() => {
      reject(new FirebaseError("User code failed to load. Cannot determine backend specification"));
    }, /* 30s to boot up */ 30_000);
  });

  while (true) {
    try {
      res = await Promise.race([fetch(`http://localhost:${port}/backend.yaml`), timeout]);
      break;
    } catch (err) {
      // Allow us to wait until the server is listening.
      if (/ECONNREFUSED/.exec(err?.message)) {
        continue;
      }
      throw err;
    }
  }

  const text = await res.text();
  logger.debug("Got response from /backend.yaml", text);

  let parsed: any;
  try {
    parsed = yaml.load(text);
  } catch (err) {
    throw new FirebaseError("Failed to parse backend specification", { children: [err] });
  }

  validateYaml(parsed);
  fillDefaults(parsed, project, api.functionsDefaultRegion, runtime);

  return parsed;
}
