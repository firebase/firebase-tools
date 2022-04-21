import * as _ from "lodash";
import { CloudFunction } from "firebase-functions";
import * as os from "os";
import * as path from "path";
import * as express from "express";
import * as fs from "fs";

import * as backend from "../deploy/functions/backend";
import { Constants } from "./constants";
import { BackendInfo, EmulatableBackend, InvokeRuntimeOpts } from "./functionsEmulator";
import { copyIfPresent } from "../gcp/proto";
import { ENV_DIRECTORY } from "../extensions/manifest";
import { substituteParams } from "../extensions/extensionsHelper";
import { ExtensionSpec, ExtensionVersion } from "../extensions/extensionsApi";
import { replaceConsoleLinks } from "./extensions/postinstall";
import { AUTH_BLOCKING_EVENTS } from "../functions/events/v1";
import { serviceForEndpoint } from "../deploy/functions/services";
import { inferBlockingDetails } from "../deploy/functions/prepare";

export type SignatureType = "http" | "event" | "cloudevent";

export interface ParsedTriggerDefinition {
  entryPoint: string;
  platform: backend.FunctionsPlatform;
  name: string;
  timeoutSeconds?: number;
  regions?: string[];
  availableMemoryMb?: "128MB" | "256MB" | "512MB" | "1GB" | "2GB" | "4GB";
  httpsTrigger?: any;
  eventTrigger?: EventTrigger;
  schedule?: EventSchedule;
  blockingTrigger?: BlockingTrigger;
  labels?: { [key: string]: any };
  codebase?: string;
}

export interface EmulatedTriggerDefinition extends ParsedTriggerDefinition {
  id: string; // An unique-id per-function, generated from the name and the region.
  region: string;
  secretEnvironmentVariables?: backend.SecretEnvVar[]; // Secret env vars needs to be specially loaded in the Emulator.
}

export interface BlockingTrigger {
  eventType: string;
  options?: Record<string, unknown>;
}

export interface EventSchedule {
  schedule: string;
  timeZone?: string;
}

export interface EventTrigger {
  resource: string;
  eventType: string;
  // Deprecated
  service?: string;
}

export interface EmulatedTriggerMap {
  [name: string]: EmulatedTrigger;
}

export interface FunctionsRuntimeArgs {
  frb: FunctionsRuntimeBundle;
  opts?: InvokeRuntimeOpts;
}

export interface FunctionsRuntimeBundle {
  proto: any;
  // TODO(danielylee): One day, we hope to get rid of all of the following properties.
  // Our goal is for the emulator environment to mimic the production environment as much
  // as possible, and that includes how the emulated functions are called. In prod,
  // the calls are made over HTTP which provides only the uri path, payload, headers, etc
  // and none of these extra properties.
  socketPath?: string;
  disabled_features?: FunctionsRuntimeFeatures;
  // TODO(danielylee): To make debugging in Functions Emulator w/ --inspect-functions flag a good experience, we run
  // all functions in a single runtime process. This is drastically different to production environment where each
  // function runs in isolated, independent containers. Until we have better design for supporting --inspect-functions
  // flag, we begrudgingly include the target trigger info in the runtime bundle so the "debug" runtime process can
  // choose which trigger to run at runtime.
  // See https://github.com/firebase/firebase-tools/issues/4189.
  debug?: {
    functionTarget: string;
    functionSignature: string;
  };
}

export interface FunctionsRuntimeFeatures {
  timeout?: boolean;
}

const memoryLookup = {
  "128MB": 128,
  "256MB": 256,
  "512MB": 512,
  "1GB": 1024,
  "2GB": 2048,
  "4GB": 4096,
};

export class HttpConstants {
  static readonly CALLABLE_AUTH_HEADER: string = "x-callable-context-auth";
  static readonly ORIGINAL_AUTH_HEADER: string = "x-original-auth";
}

export class EmulatedTrigger {
  /*
  Here we create a trigger from a single definition (data about what resources does this trigger on, etc) and
  the actual module which contains multiple functions / definitions. We locate the one we need below using
  definition.entryPoint
   */
  constructor(public definition: EmulatedTriggerDefinition, private module: any) {}

  get memoryLimitBytes(): number {
    return memoryLookup[this.definition.availableMemoryMb || "128MB"] * 1024 * 1024;
  }

  get timeoutMs(): number {
    return (this.definition.timeoutSeconds || 60) * 1000;
  }

  getRawFunction(): CloudFunction<any> {
    if (!this.module) {
      throw new Error("EmulatedTrigger has not been provided a module.");
    }

    const func = _.get(this.module, this.definition.entryPoint);
    return func.__emulator_func || func;
  }
}

export function prepareEndpoints(endpoints: backend.Endpoint[]) {
  const bkend = backend.of(...endpoints);
  for (const ep of endpoints) {
    serviceForEndpoint(ep).validateTrigger(ep as any, bkend);
  }
  inferBlockingDetails(bkend);
}

/**
 * Creates a unique trigger definition from Endpoints.
 * @param Endpoints A list of all CloudFunctions in the deployment.
 * @return A list of all CloudFunctions in the deployment.
 */
export function emulatedFunctionsFromEndpoints(
  endpoints: backend.Endpoint[]
): EmulatedTriggerDefinition[] {
  const regionDefinitions: EmulatedTriggerDefinition[] = [];
  for (const endpoint of endpoints) {
    if (!endpoint.region) {
      endpoint.region = "us-central1";
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const def: EmulatedTriggerDefinition = {
      entryPoint: endpoint.entryPoint,
      platform: endpoint.platform,
      region: endpoint.region,
      // TODO: Difference in use of name/id in Endpoint vs Emulator is subtle and confusing.
      // We should later refactor the emulator to stop using a custom trigger definition.
      name: endpoint.id,
      id: `${endpoint.region}-${endpoint.id}`,
      codebase: endpoint.codebase,
    };
    copyIfPresent(
      def,
      endpoint,
      "availableMemoryMb",
      "labels",
      "timeoutSeconds",
      "platform",
      "secretEnvironmentVariables"
    );
    // TODO: This transformation is confusing but must be kept since the Firestore/RTDB trigger registration
    // process requires it in this form. Need to work in Firestore emulator for a proper fix...
    if (backend.isHttpsTriggered(endpoint)) {
      def.httpsTrigger = endpoint.httpsTrigger;
    } else if (backend.isCallableTriggered(endpoint)) {
      def.httpsTrigger = {};
      def.labels = { ...def.labels, "deployment-callable": "true" };
    } else if (backend.isEventTriggered(endpoint)) {
      const eventTrigger = endpoint.eventTrigger;
      if (endpoint.platform === "gcfv1") {
        def.eventTrigger = {
          eventType: eventTrigger.eventType,
          resource: eventTrigger.eventFilters.resource,
        };
      } else {
        // Only pubsub and storage events are supported for gcfv2.
        const { resource, topic, bucket } = endpoint.eventTrigger.eventFilters;
        const eventResource = resource || topic || bucket;
        if (!eventResource) {
          // Unsupported event type for GCFv2
          continue;
        }
        def.eventTrigger = {
          eventType: eventTrigger.eventType,
          resource: eventResource,
        };
      }
    } else if (backend.isScheduleTriggered(endpoint)) {
      // TODO: This is an awkward transformation. Emulator does not understand scheduled triggers - maybe it should?
      def.eventTrigger = { eventType: "pubsub", resource: "" };
      def.schedule = endpoint.scheduleTrigger as EventSchedule;
    } else if (backend.isBlockingTriggered(endpoint)) {
      def.blockingTrigger = {
        eventType: endpoint.blockingTrigger.eventType,
        options: endpoint.blockingTrigger.options || {},
      };
    } else {
      // All other trigger types are not supported by the emulator
      // We leave both eventTrigger and httpTrigger attributes empty
      // and let the caller deal with invalid triggers.
    }
    regionDefinitions.push(def);
  }
  return regionDefinitions;
}

/**
 * Creates a unique trigger definition for each region a function is defined in.
 * @param definitions A list of all CloudFunctions in the deployment.
 * @return A list of all CloudFunctions in the deployment, with copies for each region.
 */
export function emulatedFunctionsByRegion(
  definitions: ParsedTriggerDefinition[],
  secretEnvVariables: backend.SecretEnvVar[] = []
): EmulatedTriggerDefinition[] {
  const regionDefinitions: EmulatedTriggerDefinition[] = [];
  for (const def of definitions) {
    if (!def.regions) {
      def.regions = ["us-central1"];
    }
    // Create a separate CloudFunction for
    // each region we deploy a function to
    for (const region of def.regions) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const defDeepCopy: EmulatedTriggerDefinition = JSON.parse(JSON.stringify(def));
      defDeepCopy.regions = [region];
      defDeepCopy.region = region;
      defDeepCopy.id = `${region}-${defDeepCopy.name}`;
      defDeepCopy.platform = defDeepCopy.platform || "gcfv1";
      defDeepCopy.secretEnvironmentVariables = secretEnvVariables;

      regionDefinitions.push(defDeepCopy);
    }
  }
  return regionDefinitions;
}

/**
 * Converts an array of EmulatedTriggerDefinitions to a map of EmulatedTriggers, which contain information on execution,
 * @param {EmulatedTriggerDefinition[]} definitions An array of regionalized, parsed trigger definitions
 * @param {Object} module Actual module which contains multiple functions / definitions
 * @return a map of trigger ids to EmulatedTriggers
 */
export function getEmulatedTriggersFromDefinitions(
  definitions: EmulatedTriggerDefinition[],
  module: any // eslint-disable-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
): EmulatedTriggerMap {
  return definitions.reduce(
    (obj: { [triggerName: string]: EmulatedTrigger }, definition: EmulatedTriggerDefinition) => {
      obj[definition.id] = new EmulatedTrigger(definition, module);
      return obj;
    },
    {}
  );
}

export function getTemporarySocketPath(pid: number, cwd: string): string {
  // See "net" package docs for information about IPC pipes on Windows
  // https://nodejs.org/api/net.html#net_identifying_paths_for_ipc_connections
  //
  // As noted in the linked documentation the socket path is truncated at a certain
  // length:
  // > On Unix, the local domain is also known as the Unix domain. The path is a filesystem pathname.
  // > It gets truncated to a length of sizeof(sockaddr_un.sun_path) - 1, which varies 91 and 107 bytes
  // > depending on the operating system. The typical values are 107 on Linux and 103 on macOS.
  //
  // On Mac our socket paths will begin with something like this:
  //   /var/folders/xl/6lkrzp7j07581mw8_4dlt3b000643s/T/{...}.sock
  // Since the system prefix is about ~50 chars we only have about ~50 more to work with
  // before we will get truncated socket names and then undefined behavior.
  if (process.platform === "win32") {
    return path.join("\\\\?\\pipe", cwd, pid.toString());
  } else {
    return path.join(os.tmpdir(), `fire_emu_${pid.toString()}.sock`);
  }
}

export function getFunctionService(def: ParsedTriggerDefinition): string {
  if (def.eventTrigger) {
    return def.eventTrigger.service ?? getServiceFromEventType(def.eventTrigger.eventType);
  }
  if (def.blockingTrigger) {
    return def.blockingTrigger.eventType;
  }

  return "unknown";
}

export function getServiceFromEventType(eventType: string): string {
  if (eventType.includes("firestore")) {
    return Constants.SERVICE_FIRESTORE;
  }
  if (eventType.includes("database")) {
    return Constants.SERVICE_REALTIME_DATABASE;
  }
  if (eventType.includes("pubsub")) {
    return Constants.SERVICE_PUBSUB;
  }
  if (eventType.includes("storage")) {
    return Constants.SERVICE_STORAGE;
  }
  // Below this point are services that do not have a emulator.
  if (eventType.includes("analytics")) {
    return Constants.SERVICE_ANALYTICS;
  }
  if (eventType.includes("auth")) {
    return Constants.SERVICE_AUTH;
  }
  if (eventType.includes("crashlytics")) {
    return Constants.SERVICE_CRASHLYTICS;
  }
  if (eventType.includes("remoteconfig")) {
    return Constants.SERVICE_REMOTE_CONFIG;
  }
  if (eventType.includes("testing")) {
    return Constants.SERVICE_TEST_LAB;
  }

  return "";
}

export function waitForBody(req: express.Request): Promise<string> {
  let data = "";
  return new Promise((resolve) => {
    req.on("data", (chunk: any) => {
      data += chunk;
    });

    req.on("end", () => {
      resolve(data);
    });
  });
}

export function findModuleRoot(moduleName: string, filepath: string): string {
  const hierarchy = filepath.split(path.sep);

  for (let i = 0; i < hierarchy.length; i++) {
    try {
      let chunks = [];
      if (i) {
        chunks = hierarchy.slice(0, -i);
      } else {
        chunks = hierarchy;
      }
      const packagePath = path.join(chunks.join(path.sep), "package.json");
      const serializedPackage = fs.readFileSync(packagePath, "utf8").toString();
      if (JSON.parse(serializedPackage).name === moduleName) {
        return chunks.join("/");
      }
      break;
    } catch (err: any) {
      /**/
    }
  }

  return "";
}

export function formatHost(info: { host: string; port: number }): string {
  if (info.host.includes(":")) {
    return `[${info.host}]:${info.port}`;
  } else {
    return `${info.host}:${info.port}`;
  }
}

export function getSignatureType(def: EmulatedTriggerDefinition): SignatureType {
  if (def.httpsTrigger) {
    return "http";
  }
  // TODO: As implemented, emulated CF3v1 functions cannot receive events in CloudEvent format, and emulated CF3v2
  // functions cannot receive events in legacy format. This conflicts with our goal of introducing a 'compat' layer
  // that allows CF3v1 functions to target GCFv2 and vice versa.
  return def.platform === "gcfv2" ? "cloudevent" : "event";
}

const LOCAL_SECRETS_FILE = ".secret.local";

/**
 * getSecretLocalPath returns the expected location for a .secret.local override file.
 */
export function getSecretLocalPath(backend: EmulatableBackend, projectDir: string) {
  const secretsFile = backend.extensionInstanceId
    ? `${backend.extensionInstanceId}${LOCAL_SECRETS_FILE}`
    : LOCAL_SECRETS_FILE;
  const secretDirectory = backend.extensionInstanceId
    ? path.join(projectDir, ENV_DIRECTORY)
    : backend.functionsDir;
  return path.join(secretDirectory, secretsFile);
}

/**
 * toBackendInfo transforms an EmulatableBackend into its correspondign API type, BackendInfo
 * @param e the emulatableBackend to transform
 * @param cf3Triggers a list of CF3 triggers. If e does not include predefinedTriggers, these will be used instead.
 */
export function toBackendInfo(
  e: EmulatableBackend,
  cf3Triggers: ParsedTriggerDefinition[]
): BackendInfo {
  const envWithSecrets = Object.assign({}, e.env);
  for (const s of e.secretEnv) {
    envWithSecrets[s.key] = backend.secretVersionName(s);
  }
  let extensionVersion = e.extensionVersion;
  if (extensionVersion) {
    extensionVersion = substituteParams<ExtensionVersion>(extensionVersion, e.env);
    if (extensionVersion.spec?.postinstallContent) {
      extensionVersion.spec.postinstallContent = replaceConsoleLinks(
        extensionVersion.spec.postinstallContent
      );
    }
  }
  let extensionSpec = e.extensionSpec;
  if (extensionSpec) {
    extensionSpec = substituteParams<ExtensionSpec>(extensionSpec, e.env);
    if (extensionSpec?.postinstallContent) {
      extensionSpec.postinstallContent = replaceConsoleLinks(extensionSpec.postinstallContent);
    }
  }

  // Parse and stringify to get rid of undefined values
  return JSON.parse(
    JSON.stringify({
      directory: e.functionsDir,
      env: envWithSecrets,
      extensionInstanceId: e.extensionInstanceId, // Present on all extensions
      extension: e.extension, // Only present on published extensions
      extensionVersion: extensionVersion, // Only present on published extensions
      extensionSpec: extensionSpec, // Only present on local extensions
      functionTriggers:
        // If we don't have predefinedTriggers, this is the CF3 backend.
        e.predefinedTriggers ?? cf3Triggers.filter((t) => t.codebase === e.codebase),
    })
  );
}
