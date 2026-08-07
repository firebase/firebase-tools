import { RunSingle } from "../../firebaseConfig";
import { AppHostingYamlConfig } from "../../apphosting/yaml";
import * as runv2 from "../../gcp/runv2";

export const DEFAULT_RUN_IGNORE = [
  "node_modules",
  ".git",
  ".next",
  ".run",
  "firebase-debug.log",
  "firebase-debug.*.log",
  ".env*.local",
  "apphosting.local.yaml",
  "**/*.secret.local",
];

export interface RunServiceConfig extends RunSingle {
  "primary-region"?: string;
  rootDir?: string;
  outputDir?: string;
  baseImage?: string;
  runtime?: string;
}

export type RunConfig = RunServiceConfig;

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
}

export interface Payload {
  run?: {
    services?: RunServiceSpec[];
  };
}

export interface Context {
  projectId?: string;
}
