import { RunSingle } from "../../firebaseConfig";
import { AppHostingYamlConfig } from "../../apphosting/yaml";
import * as runv2 from "../../gcp/runv2";
import { Options } from "../../options";

export const DEFAULT_RUN_IGNORE = [
  "node_modules",
  ".git",
  "firebase-debug.log",
  "firebase-debug.*.log",
];

export interface RunDeployOptions extends Options {
  runtime?: string;
  baseImage?: string;
  clearRuntime?: boolean;
  clearBaseImage?: boolean;
  primaryRegion?: string;
  region?: string;
  serviceAccount?: string;
  allowLocalBuildSecrets?: boolean;
  localBuild?: boolean;
}

export type RunConfig = RunSingle;

export interface RunServiceSpec {
  serviceId: string;
  region: string;
  source: string;
  ignore: string[];
  existingService?: runv2.Service;
  baseImageUri?: string;
  clearBaseImage?: boolean;
  appHostingConfig?: AppHostingYamlConfig;
  storageSource?: runv2.StorageSource;
  deployResponse?: runv2.Service;
  message?: string;
  serviceAccount?: string;
}

export interface Payload {
  run?: {
    services?: RunServiceSpec[];
  };
}

export interface Context {
  projectId?: string;
}
