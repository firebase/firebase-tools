import { EnvMap } from "../../apphosting/yaml";
import { RunSingle } from "../../firebaseConfig";
import * as runv2 from "../../gcp/runv2";

export interface ServiceDeploy {
  config: RunSingle;
  existing?: runv2.Service;
  baseImage?: string;
  buildEnv: EnvMap;
  runtimeEnv: EnvMap;
  localBuild?: {
    scratchDir: string;
    outputFiles: string[];
    runCommand?: string;
  };
  deployed?: runv2.Service;
}

export interface Payload {
  run?: { services: ServiceDeploy[] };
}

export interface Context {
  projectId: string;
  /** Overrides the service's base image. null clears it; undefined keeps the current one. */
  baseImage?: string | null;
}
