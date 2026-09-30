import { RunSingle } from "../../firebaseConfig";
import * as runv2 from "../../gcp/runv2";
import { BuildEnv } from "./buildEnv";

export interface ServiceDeploy {
  config: RunSingle;
  existing?: runv2.Service;
  baseImage?: string;
  appId?: string;
  /** Runtime FIREBASE_CONFIG JSON for the linked Firebase Web App. */
  firebaseConfig?: string;
  /** Build-time environment. Prepare only allows secrets in it for local builds. */
  buildEnv?: BuildEnv;
  /** The local build's output, set during deploy. */
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
  /** Overrides the service's Firebase Web App ID. null clears it; undefined keeps the current one. */
  appId?: string | null;
}
