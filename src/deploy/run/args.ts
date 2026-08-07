import { AppHostingYamlConfig } from "../../apphosting/yaml";
import * as runv2 from "../../gcp/runv2";

export interface RunConfig {
  serviceId: string;
  region?: string;
  source?: string;
  output?: string;
  ignore?: string[];
  baseImageUri?: string;
}

export interface RunServiceSpec {
  serviceId: string;
  region: string;
  source: string;
  ignore: string[];
  existingService?: runv2.Service;
  baseImageUri?: string;
  appHostingConfig?: AppHostingYamlConfig;
  storageSource?: runv2.StorageSource;
  deployResponse?: runv2.Service;
}

export interface Payload {
  run?: {
    services?: RunServiceSpec[];
  };
}

export interface Context {
  projectId?: string;
}
