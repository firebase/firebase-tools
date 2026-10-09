import { RunSingle } from "../../firebaseConfig";
import * as runv2 from "../../gcp/runv2";
import { BuildEnv } from "./buildEnv";

/** A service being deployed. prepare fills in the first fields, and deploy sets the rest. */
export interface ServiceDeploy {
  config: RunSingle;
  /** The service as it is in Cloud Run before this deploy, or undefined if it doesn't exist yet. */
  existing?: runv2.Service;
  baseImage?: string;
  /** The linked Firebase Web App. Deploy saves it on the service so later deploys reuse it. */
  appId?: string;
  /**
   * The linked app's config for the FIREBASE_CONFIG env var, which the Admin SDK reads at runtime.
   * Prepare looks it up so that deploy doesn't have to.
   */
  firebaseConfig?: string;
  /** Build-time environment. Prepare only allows secrets in it for local builds. */
  buildEnv?: BuildEnv;
  /** The local build's output. */
  localBuild?: {
    scratchDir: string;
    outputFiles: string[];
    runCommand?: string;
    env?: NonNullable<runv2.Container["env"]>;
  };
  /** The service after the rollout. */
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
