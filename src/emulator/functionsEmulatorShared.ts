import * as _ from "lodash";
import { CloudFunction } from "firebase-functions";
import * as os from "os";
import * as path from "path";
import * as express from "express";
import * as fs from "fs";
import { Constants } from "./constants";
import { InvokeRuntimeOpts } from "./functionsEmulator";

export enum EmulatedTriggerType {
  BACKGROUND = "BACKGROUND",
  HTTPS = "HTTPS",
}

export interface ParsedTriggerDefinition {
  entryPoint: string;
  name: string;
  timeout?: string | number; // Can be "3s" for some reason lol
  regions?: string[];
  availableMemoryMb?: "128MB" | "256MB" | "512MB" | "1GB" | "2GB" | "4GB";
  httpsTrigger?: any;
  eventTrigger?: EventTrigger;
  schedule?: EventSchedule;
  labels?: { [key: string]: any };
}

export interface EmulatedTriggerDefinition extends ParsedTriggerDefinition {
  id: string; // An unique-id per-function, generated from the name and the region.
  region: string;
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
  projectId: string;
  proto?: any;
  triggerId?: string;
  targetName?: string;
  triggerType?: EmulatedTriggerType;
  emulators: {
    firestore?: {
      host: string;
      port: number;
    };
    database?: {
      host: string;
      port: number;
    };
    pubsub?: {
      host: string;
      port: number;
    };
    auth?: {
      host: string;
      port: number;
    };
    storage?: {
      host: string;
      port: number;
    };
  };
  adminSdkConfig: {
    databaseURL?: string;
    storageBucket?: string;
  };
  socketPath?: string;
  disabled_features?: FunctionsRuntimeFeatures;
  nodeMajorVersion?: number;
  cwd: string;
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
    if (typeof this.definition.timeout === "number") {
      return this.definition.timeout * 1000;
    } else {
      return parseInt((this.definition.timeout || "60s").split("s")[0], 10) * 1000;
    }
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
 * Creates a unique trigger definition for each region a function is defined in.
 * @param definitions A list of all CloudFunctions in the deployment.
 * @return A list of all CloudFunctions in the deployment, with copies for each region.
 */
export function emulatedFunctionsByRegion(
  definitions: ParsedTriggerDefinition[]
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

export function getFunctionService(def: EmulatedTriggerDefinition): string {
  if (def.eventTrigger) {
    return def.eventTrigger.service ?? getServiceFromEventType(def.eventTrigger.eventType);
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
    } catch (err) {
      /**/
    }
  }

  return "";
}
