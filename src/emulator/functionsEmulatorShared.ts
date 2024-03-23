import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { randomBytes } from "crypto";
import * as _ from "lodash";
import * as express from "express";
import { CloudFunction } from "firebase-functions";

import * as backend from "../deploy/functions/backend";
import { Constants } from "./constants";
import { BackendInfo, EmulatableBackend, InvokeRuntimeOpts } from "./functionsEmulator";
import { ENV_DIRECTORY } from "../extensions/manifest";
import { substituteParams } from "../extensions/extensionsHelper";
import { ExtensionSpec, ExtensionVersion } from "../extensions/types";
import { replaceConsoleLinks } from "./extensions/postinstall";
import { serviceForEndpoint } from "../deploy/functions/services";
import { inferBlockingDetails } from "../deploy/functions/prepare";
import * as events from "../functions/events";
import { connectableHostname } from "../utils";

/** The current v2 events that are implemented in the emulator */
const V2_EVENTS = [
  events.v2.PUBSUB_PUBLISH_EVENT,
  ...events.v2.STORAGE_EVENTS,
  ...events.v2.DATABASE_EVENTS,
  ...events.v2.FIRESTORE_EVENTS,
];

/**
 * Label for eventarc event sources.
 * TODO: Consider DRYing from functions/prepare.ts
 * A nice place would be to put it in functionsv2.ts once we get rid of functions.ts
 */
export const EVENTARC_SOURCE_ENV = "EVENTARC_CLOUD_EVENT_SOURCE";

export type SignatureType = "http" | "event" | "cloudevent";

export interface ParsedTriggerDefinition {
  entryPoint: string;
  platform: backend.FunctionsPlatform;
  name: string;
  timeoutSeconds?: number;
  regions?: string[];
  availableMemoryMb?: backend.MemoryOptions;
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
  resource?: string;
  eventType: string;
  channel?: string;
  eventFilters?: Record<string, string>;
  eventFilterPathPatterns?: Record<string, string>;
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
  constructor(
    public definition: EmulatedTriggerDefinition,
    private module: any,
  ) {}

  get memoryLimitBytes(): number {
    return (this.definition.availableMemoryMb || 128) * 1024 * 1024;
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

/**
 * Checks if the v2 event service has been implemented in the emulator
 */
export function eventServiceImplemented(eventType: string): boolean {
  return V2_EVENTS.includes(eventType);
}

/**
 * Validates that triggers are correctly formed and fills in some defaults.
 */
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
  endpoints: backend.Endpoint[],
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
    def.availableMemoryMb = endpoint.availableMemoryMb || 256;
    def.labels = endpoint.labels || {};
    if (endpoint.platform === "gcfv1") {
      def.labels[EVENTARC_SOURCE_ENV] =
        "cloudfunctions-emulated.googleapis.com" +
        `/projects/${endpoint.project || "project"}/locations/${endpoint.region}/functions/${
          endpoint.id
        }`;
    } else if (endpoint.platform === "gcfv2") {
      def.labels[EVENTARC_SOURCE_ENV] =
        "run-emulated.googleapis.com" +
        `/projects/${endpoint.project || "project"}/locations/${endpoint.region}/services/${
          endpoint.id
        }`;
    }
    def.timeoutSeconds = endpoint.timeoutSeconds || 60;
    def.secretEnvironmentVariables = endpoint.secretEnvironmentVariables || [];
    def.platform = endpoint.platform;
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
          resource: eventTrigger.eventFilters!.resource,
        };
      } else {
        // TODO(colerogers): v2 events implemented are pubsub, storage, rtdb, and custom events
        if (!eventServiceImplemented(eventTrigger.eventType) && !eventTrigger.channel) {
          continue;
        }

        // We use resource for pubsub & storage
        const { resource, topic, bucket } = endpoint.eventTrigger.eventFilters as any;
        const eventResource = resource || topic || bucket;

        def.eventTrigger = {
          eventType: eventTrigger.eventType,
          resource: eventResource,
          channel: eventTrigger.channel,
          eventFilters: eventTrigger.eventFilters,
          eventFilterPathPatterns: eventTrigger.eventFilterPathPatterns,
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
    } else if (backend.isTaskQueueTriggered(endpoint)) {
      // Just expose TQ trigger as HTTPS. Useful for debugging.
      def.httpsTrigger = {};
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
  secretEnvVariables: backend.SecretEnvVar[] = [],
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
 * @param {object} module Actual module which contains multiple functions / definitions
 * @return a map of trigger ids to EmulatedTriggers
 */
export function getEmulatedTriggersFromDefinitions(
  definitions: EmulatedTriggerDefinition[],
  module: any, // eslint-disable-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
): EmulatedTriggerMap {
  return definitions.reduce(
    (obj: { [triggerName: string]: EmulatedTrigger }, definition: EmulatedTriggerDefinition) => {
      obj[definition.id] = new EmulatedTrigger(definition, module);
      return obj;
    },
    {},
  );
}

/**
 * Create a path that used to create a tempfile for IPC over socket files.
 */
export function getTemporarySocketPath(): string {
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
  const rand = randomBytes(8).toString("hex");
  if (process.platform === "win32") {
    return path.join("\\\\?\\pipe", `fire_emu_${rand}`);
  } else {
    return path.join(os.tmpdir(), `fire_emu_${rand}.sock`);
  }
}

/**
 * In GCF 1st gen, there was a mostly undocumented "service" field
 * which identified where an event was coming from. This is used in the emulator
 * to determine which emulator serves these triggers. Now that GCF 2nd gen
 * discontinued the "service" field this becomes more bespoke.
 */
export function getFunctionService(def: ParsedTriggerDefinition): string {
  if (def.eventTrigger) {
    if (def.eventTrigger.channel) {
      return Constants.SERVICE_EVENTARC;
    }
    return def.eventTrigger.service ?? getServiceFromEventType(def.eventTrigger.eventType);
  }
  if (def.blockingTrigger) {
    return def.blockingTrigger.eventType;
  }
  if (def.httpsTrigger) {
    return "https";
  }

  return "unknown";
}

/**
 * Returns a service ID to use for GCF 2nd gen events. Used to connect the right
 * emulator service.
 */
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

/**
 * Create a Promise which can be awaited to recieve request bodies as strings.
 */
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

/**
 * Find the root directory housing a node module.
 */
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

/**
 * Format a hostname for TCP dialing. Should only be used in Functions emulator.
 *
 * This is similar to EmulatorRegistry.url but with no explicit dependency on
 * the registry and so on and thus can work in functions shell.
 *
 * For any other part of the CLI, please use EmulatorRegistry.url(...).host
 * instead, which handles discovery, formatting, and fixing host in one go.
 */
export function formatHost(info: { host: string; port: number }): string {
  const host = connectableHostname(info.host);
  if (host.includes(":")) {
    return `[${host}]:${info.port}`;
  } else {
    return `${host}:${info.port}`;
  }
}

/**
 * Determines the correct value for the environment variable that tells the
 * Functions Framework how to parse this functions' input.
 */
export function getSignatureType(def: EmulatedTriggerDefinition): SignatureType {
  if (def.httpsTrigger || def.blockingTrigger) {
    return "http";
  }
  if (def.platform === "gcfv2" && def.schedule) {
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
  cf3Triggers: ParsedTriggerDefinition[],
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
        extensionVersion.spec.postinstallContent,
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
    }),
  );
}
